import type {
	AiChatErrorClassification,
	AiChatErrorStage,
} from "#/features/workspaces/ai/chat/chat-model";
import { AlertCircle, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";
import type { HTMLMotionProps } from "motion/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import ThinkExLogo from "#/components/ThinkExLogo";
import { Button } from "#/components/ui/button";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import { Message, MessageContent } from "#/components/ui/message";
import { AiChatAssistantPending } from "#/features/workspaces/components/ai-chat/AiChatAssistantPending";
import {
	AiChatTranscriptItem,
	AiChatTranscriptScroller,
} from "#/features/workspaces/components/ai-chat/AiChatTranscriptScroller";
import AiChatMessageRow from "#/features/workspaces/components/ai-chat/AiChatMessageRow";
import AiChatTranscriptRail from "#/features/workspaces/components/ai-chat/AiChatTranscriptRail";
import {
	type AiChatPresentation,
	type AssistantRowDisplay,
	getAssistantRowDisplay,
	isAiChatStreamActive,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
import { isAiChatUsageLimitErrorState } from "#/features/workspaces/components/ai-chat/ai-chat-error-state";
import type { AiChatMessage } from "#/features/workspaces/components/ai-chat/types";
import { WorkspaceFloatingAskSelectionMenu } from "#/features/workspaces/components/WorkspaceFloatingAskSelectionMenu";
import { stageComposerQuote } from "#/features/workspaces/composer/workspace-composer-actions";
import { createAssistantResponseSelectedQuote } from "#/features/workspaces/model/workspace-selected-quotes";
import {
	getRangeClientRect,
	type SelectionRect,
} from "#/features/workspaces/model/workspace-selection-geometry";

type SelectedText = {
	rect: SelectionRect;
	text: string;
};

const sentMessageAnimation = {
	animate: { opacity: 1, scale: 1, y: 0 },
	initial: { opacity: 0, scale: 0.985, y: 18 },
	transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
} satisfies Pick<HTMLMotionProps<"div">, "animate" | "initial" | "transition">;

const tailRowAnimation = {
	animate: { opacity: 1, y: 0 },
	initial: { opacity: 0, y: 6 },
	transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] },
} satisfies Pick<HTMLMotionProps<"div">, "animate" | "initial" | "transition">;

export type AiChatAssistantErrorState =
	| {
			classification?: AiChatErrorClassification | null;
			kind: "assistant";
			message?: string | null;
			stage?: AiChatErrorStage | null;
	  }
	| {
			kind: "aborted";
	  }
	| {
			kind: "connection";
	  };

type AiChatListRow =
	| {
			display: AssistantRowDisplay | null;
			key: string;
			message: AiChatMessage;
			type: "message";
	  }
	| {
			key: string;
			type: "pending";
	  }
	| {
			errorState: AiChatAssistantErrorState;
			key: string;
			type: "error";
	  };

interface AiChatMessageListProps {
	anchorMessageId?: string | null;
	assistantError?: AiChatAssistantErrorState | null;
	/** The message currently loaded into the composer for editing, dimmed here. */
	editingMessageId?: string;
	messages: AiChatMessage[];
	/** Present only while an edit could start; offered on the latest user message. */
	onEditMessage?: (message: AiChatMessage) => void;
	onRegenerateLastResponse?: () => void;
	onStartNewChat?: () => void;
	presentation: AiChatPresentation;
	sentMessageAnimationId?: string | null;
	workspaceId: string;
}

export default function AiChatMessageList({
	anchorMessageId,
	assistantError,
	editingMessageId,
	messages,
	onEditMessage,
	onRegenerateLastResponse,
	onStartNewChat,
	presentation,
	sentMessageAnimationId,
	workspaceId,
}: AiChatMessageListProps) {
	const { lastAssistantMessageId, status } = presentation;
	const lastUserMessageId = getLastUserMessageId(messages);
	const rows = getAiChatListRows(messages, presentation, assistantError);
	const hasAssistantContent = hasLatestAssistantContent(rows);
	const isStreamActive = isAiChatStreamActive(status);
	const listRef = useRef<HTMLDivElement>(null);
	const shouldReduceMotion = useReducedMotion();
	const [selectedText, setSelectedText] = useState<SelectedText | null>(null);
	const showEmptyState = rows.length === 0 && !assistantError;

	useEffect(() => {
		const updateSelection = () => {
			setSelectedText(getSelectedText(listRef.current));
		};

		document.addEventListener("selectionchange", updateSelection);

		return () => {
			document.removeEventListener("selectionchange", updateSelection);
		};
	}, []);

	return (
		<div ref={listRef} className="relative min-h-0 flex-1">
			{showEmptyState ? (
				<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
					<div className="flex flex-col items-center justify-center gap-3">
						<ThinkExLogo size={32} />
						<p className="text-sm text-muted-foreground">Start a new chat</p>
					</div>
				</div>
			) : null}
			<AiChatTranscriptScroller
				anchorMessageId={anchorMessageId ?? undefined}
				busy={isStreamActive}
				initialAnchorMessageId={lastUserMessageId}
				reduceMotion={shouldReduceMotion === true}
				smoothAnchorMessageId={
					shouldReduceMotion ? undefined : (sentMessageAnimationId ?? undefined)
				}
			>
				<LazyMotion features={domAnimation}>
					{rows.map((row) => (
						<AiChatMessageScrollerItem
							key={row.key}
							entryAnimation={
								shouldReduceMotion ? null : getAiChatRowEntryAnimation(row, sentMessageAnimationId)
							}
							messageId={getAiChatRowMessageId(row)}
						>
							<AiChatListRowView
								canRetry={Boolean(onRegenerateLastResponse)}
								editingMessageId={editingMessageId}
								hasAssistantContent={hasAssistantContent}
								lastAssistantMessageId={lastAssistantMessageId}
								lastUserMessageId={lastUserMessageId}
								row={row}
								status={status}
								onEditMessage={onEditMessage}
								onRegenerateLastResponse={onRegenerateLastResponse}
								onStartNewChat={onStartNewChat}
							/>
						</AiChatMessageScrollerItem>
					))}
				</LazyMotion>
			</AiChatTranscriptScroller>
			{selectedText ? (
				<WorkspaceFloatingAskSelectionMenu
					rect={selectedText.rect}
					onAsk={() => {
						stageComposerQuote(
							workspaceId,
							createAssistantResponseSelectedQuote({
								text: selectedText.text,
							}),
							{ revealChat: false },
						);
						window.getSelection()?.removeAllRanges();
						setSelectedText(null);
					}}
				/>
			) : null}
		</div>
	);
}

function AiChatMessageScrollerItem({
	children,
	entryAnimation,
	messageId,
}: {
	children: ReactNode;
	entryAnimation: "sent" | "tail" | null;
	messageId: string;
}) {
	const animationProps: Pick<
		HTMLMotionProps<"div">,
		"animate" | "initial" | "transition"
	> = entryAnimation === "sent"
		? sentMessageAnimation
		: entryAnimation === "tail"
			? tailRowAnimation
			: { initial: false };

	return (
		<AiChatTranscriptItem messageId={messageId}>
			<m.div className="min-w-0" {...animationProps}>
				{children}
			</m.div>
		</AiChatTranscriptItem>
	);
}

function AiChatListRowView({
	canRetry,
	editingMessageId,
	hasAssistantContent,
	lastAssistantMessageId,
	lastUserMessageId,
	onEditMessage,
	onRegenerateLastResponse,
	onStartNewChat,
	row,
	status,
}: {
	canRetry: boolean;
	editingMessageId: string | undefined;
	hasAssistantContent: boolean;
	lastAssistantMessageId: string | undefined;
	lastUserMessageId: string | undefined;
	onEditMessage?: (message: AiChatMessage) => void;
	onRegenerateLastResponse?: () => void;
	onStartNewChat?: () => void;
	row: AiChatListRow;
	status: AiChatPresentation["status"];
}) {
	if (row.type === "pending") {
		return (
			<AiChatTranscriptRail>
				<AiChatAssistantPending />
			</AiChatTranscriptRail>
		);
	}

	if (row.type === "error") {
		return (
			<AiChatTranscriptRail>
				<AiChatAssistantError
					canRetry={
						canRetry &&
						row.errorState.kind !== "connection" &&
						!isAiChatUsageLimitErrorState(row.errorState)
					}
					errorState={row.errorState}
					hasAssistantContent={hasAssistantContent}
					onRetry={onRegenerateLastResponse}
					onStartNewChat={onStartNewChat}
				/>
			</AiChatTranscriptRail>
		);
	}

	const { display, message } = row;
	return (
		<AiChatTranscriptRail>
			<AiChatMessageRow
				display={display}
				isBeingEdited={message.id === editingMessageId}
				isLatestAssistant={message.role === "assistant" && message.id === lastAssistantMessageId}
				isRegenerable={message.id === lastAssistantMessageId && status === "ready"}
				isStreaming={message.id === lastAssistantMessageId && isAiChatStreamActive(status)}
				message={message}
				onEdit={
					onEditMessage &&
					message.role === "user" &&
					message.id === lastUserMessageId &&
					// The composer edits text; an attachment-only message has none to
					// load, which would trap the user in a banner with a dead submit.
					message.parts.some((part) => part.type === "text")
						? () => onEditMessage(message)
						: undefined
				}
				onRegenerate={onRegenerateLastResponse}
			/>
		</AiChatTranscriptRail>
	);
}

function AiChatAssistantError({
	canRetry,
	errorState,
	hasAssistantContent,
	onRetry,
	onStartNewChat,
}: {
	canRetry: boolean;
	errorState: AiChatAssistantErrorState;
	hasAssistantContent: boolean;
	onRetry?: () => void;
	onStartNewChat?: () => void;
}) {
	// An overflowed chat can rarely be retried into success, so the escape
	// hatch the copy suggests gets its own action.
	const canStartNewChat =
		errorState.kind === "assistant" &&
		errorState.classification === "context_overflow" &&
		Boolean(onStartNewChat);
	// Classified errors get curated copy; for the rest the stored server
	// message (usage limits, recovery reasons) beats an unexplained failure.
	const errorDetail =
		errorState.kind === "assistant" && !errorState.classification ? errorState.message : null;

	return (
		<Message>
			<MessageContent>
				<Bubble variant="muted">
					<BubbleContent className="flex flex-col items-start gap-3">
						<div className="flex items-start gap-2">
							<AlertCircle
								className="mt-0.5 size-4 shrink-0 text-muted-foreground"
								aria-hidden="true"
							/>
							<div className="flex flex-col gap-1">
								<p className="text-sm">
									{getChatErrorMessage({
										errorState,
										hasAssistantContent,
									})}
								</p>
								{errorDetail ? (
									<p className="text-muted-foreground text-xs">{errorDetail}</p>
								) : null}
							</div>
						</div>
						{errorState.kind === "connection" ? (
							<Button
								type="button"
								variant="outline"
								size="xs"
								className="gap-1.5"
								onClick={() => {
									window.location.reload();
								}}
							>
								<RefreshCw className="size-3" />
								Refresh page
							</Button>
						) : null}
						{canRetry || canStartNewChat ? (
							<div className="flex items-center gap-2">
								{canRetry ? (
									<Button
										type="button"
										variant="outline"
										size="xs"
										className="gap-1.5"
										onClick={onRetry}
									>
										<RotateCcw className="size-3" />
										Try again
									</Button>
								) : null}
								{canStartNewChat ? (
									<Button
										type="button"
										variant="outline"
										size="xs"
										className="gap-1.5"
										onClick={onStartNewChat}
									>
										<Plus className="size-3" />
										Start new chat
									</Button>
								) : null}
							</div>
						) : null}
					</BubbleContent>
				</Bubble>
			</MessageContent>
		</Message>
	);
}

function getAiChatListRows(
	messages: AiChatMessage[],
	presentation: AiChatPresentation,
	assistantError?: AiChatAssistantErrorState | null,
): AiChatListRow[] {
	const rows: AiChatListRow[] = [];

	for (const message of messages) {
		const display = getAssistantRowDisplay(message, presentation);

		if (display?.kind === "hidden") {
			continue;
		}

		rows.push({
			display,
			key: `message:${message.id}`,
			message,
			type: "message",
		});
	}

	if (presentation.tailPending) {
		rows.push({
			key: "assistant-pending:tail",
			type: "pending",
		});
	}

	if (assistantError) {
		rows.push({
			errorState: assistantError,
			key: "assistant-error",
			type: "error",
		});
	}

	return rows;
}

function hasLatestAssistantContent(rows: AiChatListRow[]) {
	for (let i = rows.length - 1; i >= 0; i -= 1) {
		const row = rows[i];

		if (row.type !== "message" || row.message.role !== "assistant") {
			continue;
		}

		return row.display?.kind === "content" && row.display.parts.length > 0;
	}

	return false;
}

function getAiChatRowMessageId(row: AiChatListRow) {
	if (row.type === "message") {
		return row.message.id;
	}

	return row.key;
}

function getAiChatRowEntryAnimation(
	row: AiChatListRow,
	sentMessageAnimationId?: string | null,
): "sent" | "tail" | null {
	if (getAiChatRowMessageId(row) === sentMessageAnimationId) {
		return "sent";
	}

	if (row.type === "pending") {
		return "tail";
	}

	return null;
}

function getLastUserMessageId(messages: AiChatMessage[]) {
	for (let index = messages.length - 1; index >= 0; index -= 1) {
		const message = messages[index];
		if (message?.role === "user") {
			return message.id;
		}
	}

	return undefined;
}

function getSelectedText(root: HTMLElement | null): SelectedText | null {
	const selection = window.getSelection();

	if (!root || !selection || selection.rangeCount === 0) {
		return null;
	}

	const anchorNode = selection.anchorNode;
	const text = selection.toString().trim();

	if (!anchorNode || !root.contains(anchorNode) || !text) {
		return null;
	}

	const rect = getRangeClientRect(selection.getRangeAt(0), null);
	return rect ? { rect, text } : null;
}

function getChatErrorMessage({
	errorState,
	hasAssistantContent,
}: {
	errorState: AiChatAssistantErrorState;
	hasAssistantContent: boolean;
}) {
	if (errorState.kind === "connection") {
		return "The chat connection closed before the response could finish.";
	}

	if (errorState.kind === "aborted") {
		return "The response was stopped before it started.";
	}

	// The server's own sentence names what ran out and when it comes back; the
	// allowance notice under the composer carries the upgrade path.
	if (errorState.classification === "usage_limit") {
		return errorState.message ?? "You’ve used up this month’s messages.";
	}

	if (errorState.classification === "context_overflow") {
		return "This chat got too large to finish. Try again or start a new chat.";
	}

	if (errorState.classification === "rate_limit") {
		return "The AI provider hit a rate limit. Wait a moment, then try again.";
	}

	if (errorState.stage === "recovery") {
		return hasAssistantContent
			? "The response was interrupted before it finished."
			: "The response was interrupted before it could start.";
	}

	return hasAssistantContent
		? "Something went wrong before the response could finish."
		: "Something went wrong before the response could be generated.";
}
