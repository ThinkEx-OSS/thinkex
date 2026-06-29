import { isToolUIPart } from "ai";
import { Check, Copy, RotateCcw } from "lucide-react";
import { useState } from "react";

import { AnimatedIconSwap } from "#/components/ui/animated-icon-swap";
import { Button } from "#/components/ui/button";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Collapsible, CollapsibleTrigger } from "#/components/ui/collapsible";
import { Message, MessageContent, MessageFooter } from "#/components/ui/message";
import { Tooltip, TooltipContent, TooltipTrigger } from "#/components/ui/tooltip";
import { AiChatMessagePartView } from "#/features/workspaces/components/ai-chat/AiChatMessagePartView";
import {
	type AiChatRenderablePart,
	type AssistantRowDisplay,
	getDisplayableParts,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import type { AiChatMessage } from "#/features/workspaces/components/ai-chat/types";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard";
import { cn } from "#/lib/utils";

const messageToolbarActionClass =
	"flex size-8 items-center justify-center rounded-lg text-muted-foreground/70 transition-[color,scale] duration-150 ease-out outline-none hover:bg-transparent hover:text-foreground hover:scale-105 focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:scale-100";
const COLLAPSIBLE_USER_MESSAGE_MAX_CHARACTERS = 700;
const COLLAPSIBLE_USER_MESSAGE_MAX_LINES = 8;
const collapsedUserMessageClassName =
	"max-h-56 overflow-hidden [mask-image:linear-gradient(to_bottom,black_72%,transparent)]";

export default function AiChatMessageRow({
	display,
	isLatestAssistant,
	isRegenerable,
	isStreaming,
	message,
	onRegenerate,
}: {
	display: AssistantRowDisplay | null;
	isLatestAssistant: boolean;
	isRegenerable: boolean;
	isStreaming: boolean;
	message: AiChatMessage;
	onRegenerate?: () => void;
}) {
	if (message.role === "assistant" && display?.kind === "hidden") {
		return null;
	}

	const isAssistant = message.role === "assistant";
	const displayableParts = isAssistant ? [] : getDisplayableParts(message);
	const userAttachmentParts = isAssistant ? [] : displayableParts.filter(isAttachmentPart);
	const userBodyParts = isAssistant
		? []
		: displayableParts.filter((part) => !isAttachmentPart(part));
	const copyableText = isAssistant ? getCopyableMessageText(message) : "";

	return (
		<Message align={isAssistant ? "start" : "end"}>
			<MessageContent>
				{userAttachmentParts.length > 0 ? (
					<div className="mb-2 ml-auto flex w-fit max-w-full flex-col gap-2">
						{userAttachmentParts.map((part, index) => (
							<AiChatMessagePartView key={getMessagePartKey(message.id, part, index)} part={part} />
						))}
					</div>
				) : null}
				{isAssistant || userBodyParts.length > 0 ? (
					<Bubble variant={isAssistant ? "ghost" : "secondary"}>
						<BubbleContent>
							{isAssistant && display ? (
								<AssistantMessageBody
									display={display}
									isStreaming={isStreaming}
									message={message}
									onRegenerate={onRegenerate}
								/>
							) : (
								<UserMessageBody message={message} parts={userBodyParts} />
							)}
						</BubbleContent>
					</Bubble>
				) : null}
				{isAssistant && display?.kind === "content" && display.parts.length > 0 && !isStreaming ? (
					<MessageFooter
						className={cn(
							"px-0 transition-opacity duration-150 ease-out",
							isLatestAssistant
								? "opacity-100"
								: "pointer-events-none opacity-0 group-hover/message:pointer-events-auto group-hover/message:opacity-100 group-focus-within/message:pointer-events-auto group-focus-within/message:opacity-100",
						)}
					>
						<div className="flex items-center gap-1">
							{copyableText ? <CopyResponseAction text={copyableText} /> : null}
							{isRegenerable && onRegenerate ? (
								<AiChatMessageAction label="Regenerate response" onClick={onRegenerate}>
									<RotateCcw className="size-4" />
								</AiChatMessageAction>
							) : null}
						</div>
					</MessageFooter>
				) : null}
			</MessageContent>
		</Message>
	);
}

function UserMessageBody({
	message,
	parts,
}: {
	message: AiChatMessage;
	parts: AiChatRenderablePart[];
}) {
	const [isOpen, setIsOpen] = useState(false);
	const shouldCollapse = shouldCollapseUserMessage(parts);

	if (!shouldCollapse) {
		return <UserMessageParts message={message} parts={parts} />;
	}

	return (
		<Collapsible open={isOpen} onOpenChange={setIsOpen}>
			<div className={cn("overflow-hidden", !isOpen && collapsedUserMessageClassName)}>
				<UserMessageParts message={message} parts={parts} />
			</div>
			<CollapsibleTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="xs"
						className="-ml-2 mt-1 h-6 px-2 text-secondary-foreground/70 hover:bg-transparent hover:text-secondary-foreground"
					/>
				}
			>
				{isOpen ? "Show less" : "Show more"}
			</CollapsibleTrigger>
		</Collapsible>
	);
}

function UserMessageParts({
	message,
	parts,
}: {
	message: AiChatMessage;
	parts: AiChatRenderablePart[];
}) {
	return parts.map((part, index) => (
		<AiChatMessagePartView
			key={getMessagePartKey(message.id, part, index)}
			part={part}
			preserveWhitespace={true}
		/>
	));
}

function shouldCollapseUserMessage(parts: AiChatRenderablePart[]) {
	let characterCount = 0;
	let lineCount = 0;

	for (const part of parts) {
		if (part.type !== "text") {
			continue;
		}

		characterCount += part.text.length;
		lineCount += part.text.split("\n").length;
	}

	return (
		characterCount > COLLAPSIBLE_USER_MESSAGE_MAX_CHARACTERS ||
		lineCount > COLLAPSIBLE_USER_MESSAGE_MAX_LINES
	);
}

function isAttachmentPart(part: AiChatRenderablePart) {
	return part.type === "file" || part.type === "source-document";
}

function AssistantMessageBody({
	display,
	isStreaming,
	message,
	onRegenerate,
}: {
	display: AssistantRowDisplay;
	isStreaming: boolean;
	message: AiChatMessage;
	onRegenerate?: () => void;
}) {
	if (display.kind === "content") {
		return display.parts.map((part, index) => (
			<AiChatMessagePartView
				key={getMessagePartKey(message.id, part, index)}
				isStreaming={isStreaming}
				part={part}
			/>
		));
	}

	if (display.kind === "empty-terminal") {
		return (
			<EmptyAssistantResponse
				canRegenerate={display.canRegenerate && Boolean(onRegenerate)}
				onRegenerate={onRegenerate}
			/>
		);
	}

	return null;
}

function EmptyAssistantResponse({
	canRegenerate,
	onRegenerate,
}: {
	canRegenerate: boolean;
	onRegenerate?: () => void;
}) {
	return (
		<div className="flex flex-col items-start gap-2 text-muted-foreground text-sm">
			<p>The AI didn't return a response.</p>
			{canRegenerate ? (
				<Button
					type="button"
					variant="outline"
					size="xs"
					onClick={onRegenerate}
					className="gap-1.5"
				>
					<RotateCcw className="size-3" />
					Try again
				</Button>
			) : null}
		</div>
	);
}

function CopyResponseAction({ text }: { text: string }) {
	const { copied, copy } = useCopyToClipboard({
		onError: (error) => {
			console.warn("[AiChatMessageRow] Failed to copy response", error);
		},
	});
	const label = copied ? "Copied" : "Copy response";

	return (
		<AiChatMessageAction
			label={label}
			onClick={() => {
				void copy(text);
			}}
		>
			<AnimatedIconSwap swapKey={copied} className="size-4">
				{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
			</AnimatedIconSwap>
		</AiChatMessageAction>
	);
}

function AiChatMessageAction({
	children,
	className,
	label,
	...props
}: React.ComponentProps<"button"> & { label: string }) {
	const button = (
		<button type="button" className={cn(messageToolbarActionClass, className)} {...props}>
			{children}
			<span className="sr-only">{label}</span>
		</button>
	);

	return (
		<Tooltip>
			<TooltipTrigger render={button} />
			<TooltipContent>
				<p>{label}</p>
			</TooltipContent>
		</Tooltip>
	);
}

function getCopyableMessageText(message: AiChatMessage) {
	const textParts: string[] = [];

	for (const part of message.parts) {
		if (part.type === "text") {
			textParts.push(part.text);
		}
	}

	return textParts.join("\n\n").trim();
}

function getMessagePartKey(messageId: string, part: AiChatRenderablePart, index: number) {
	if (isToolGroupPart(part)) {
		return `${messageId}-${part.type}-${part.part.toolCallId}`;
	}

	if (isToolUIPart(part)) {
		return `${messageId}-tool-${part.toolCallId}`;
	}

	if (part.type === "file") {
		return `${messageId}-file-${part.url}`;
	}

	if (part.type === "source-url" || part.type === "source-document") {
		return `${messageId}-${part.type}-${part.sourceId}`;
	}

	if (part.type.startsWith("data-")) {
		const dataPart = part as { id?: string; type: string };
		return `${messageId}-${dataPart.type}-${dataPart.id ?? index}`;
	}

	return `${messageId}-${part.type}-${index}`;
}

function isToolGroupPart(
	part: AiChatRenderablePart,
): part is Extract<AiChatRenderablePart, { type: "data-tool-group" }> {
	return part.type === "data-tool-group";
}
