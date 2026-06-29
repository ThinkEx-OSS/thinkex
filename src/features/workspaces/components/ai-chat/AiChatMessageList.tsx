import type { ChatErrorClassification, ChatErrorContext } from "@cloudflare/think";
import { AlertCircle, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ThinkExLogo from "#/components/ThinkExLogo";
import { Button } from "#/components/ui/button";
import { Bubble, BubbleContent } from "#/components/ui/bubble";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import { Message, MessageContent } from "#/components/ui/message";
import { AiChatAssistantPending } from "#/features/workspaces/components/ai-chat/AiChatAssistantPending";
import {
	aiChatMessageScrollerButtonClassName,
	aiChatMessageScrollerContentClassName,
	aiChatMessageScrollerViewportClassName,
} from "#/features/workspaces/components/ai-chat/ai-chat-layout";
import AiChatMessageRow from "#/features/workspaces/components/ai-chat/AiChatMessageRow";
import AiChatTranscriptRail from "#/features/workspaces/components/ai-chat/AiChatTranscriptRail";
import {
	type AiChatPresentation,
	type AssistantRowDisplay,
	getAssistantRowDisplay,
	isAiChatStreamActive,
} from "#/features/workspaces/components/ai-chat/ai-chat-display-state";
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

export interface AiChatAssistantErrorState {
	classification?: ChatErrorClassification | null;
	stage?: ChatErrorContext["stage"] | null;
}

type AiChatListRow =
	| {
			display: AssistantRowDisplay | null;
			key: string;
			message: AiChatMessage;
			type: "message";
	  }
	| {
			key: string;
			pending: NonNullable<AiChatPresentation["tailPending"]>;
			type: "pending";
	  }
	| {
			errorState: AiChatAssistantErrorState;
			key: string;
			type: "error";
	  };

interface AiChatMessageListProps {
	assistantError?: AiChatAssistantErrorState | null;
	messages: AiChatMessage[];
	onRegenerateLastResponse?: () => void;
	presentation: AiChatPresentation;
	workspaceId: string;
}

export default function AiChatMessageList({
	assistantError,
	messages,
	onRegenerateLastResponse,
	presentation,
	workspaceId,
}: AiChatMessageListProps) {
	const { lastAssistantMessageId, status } = presentation;
	const rows = getAiChatListRows(messages, presentation, assistantError);
	const hasAssistantContent = hasLatestAssistantContent(rows);
	const isStreamActive = isAiChatStreamActive(status);
	const listRef = useRef<HTMLDivElement>(null);
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
		<div ref={listRef} className="min-h-0 flex-1">
			<MessageScrollerProvider
				appendedAnchorScrollBehavior="smooth"
				defaultScrollPosition="last-anchor"
				scrollPreviousItemPeek={40}
			>
				<MessageScroller>
					{showEmptyState ? (
						<div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
							<div className="flex flex-col items-center justify-center gap-3">
								<ThinkExLogo size={32} />
								<p className="text-sm text-muted-foreground">Start a new chat</p>
							</div>
						</div>
					) : null}
					<MessageScrollerViewport className={aiChatMessageScrollerViewportClassName}>
						<MessageScrollerContent
							aria-busy={isStreamActive}
							className={aiChatMessageScrollerContentClassName}
						>
							{rows.map((row) => (
								<MessageScrollerItem
									key={row.key}
									messageId={getAiChatRowMessageId(row)}
									scrollAnchor={isAiChatRowScrollAnchor(row)}
								>
									<AiChatListRowView
										canRetry={Boolean(onRegenerateLastResponse)}
										hasAssistantContent={hasAssistantContent}
										lastAssistantMessageId={lastAssistantMessageId}
										row={row}
										status={status}
										onRegenerateLastResponse={onRegenerateLastResponse}
									/>
								</MessageScrollerItem>
							))}
						</MessageScrollerContent>
					</MessageScrollerViewport>
					<MessageScrollerButton className={aiChatMessageScrollerButtonClassName} />
				</MessageScroller>
			</MessageScrollerProvider>
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

function AiChatListRowView({
	canRetry,
	hasAssistantContent,
	lastAssistantMessageId,
	onRegenerateLastResponse,
	row,
	status,
}: {
	canRetry: boolean;
	hasAssistantContent: boolean;
	lastAssistantMessageId: string | undefined;
	onRegenerateLastResponse?: () => void;
	row: AiChatListRow;
	status: AiChatPresentation["status"];
}) {
	if (row.type === "pending") {
		return (
			<AiChatTranscriptRail>
				<AiChatAssistantPending pending={row.pending} />
			</AiChatTranscriptRail>
		);
	}

	if (row.type === "error") {
		return (
			<AiChatTranscriptRail>
				<AiChatAssistantError
					canRetry={canRetry}
					errorState={row.errorState}
					hasAssistantContent={hasAssistantContent}
					onRetry={onRegenerateLastResponse}
				/>
			</AiChatTranscriptRail>
		);
	}

	const { display, message } = row;
	return (
		<AiChatTranscriptRail>
			<AiChatMessageRow
				display={display}
				isLatestAssistant={message.role === "assistant" && message.id === lastAssistantMessageId}
				isRegenerable={message.id === lastAssistantMessageId && status === "ready"}
				isStreaming={message.id === lastAssistantMessageId && isAiChatStreamActive(status)}
				message={message}
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
}: {
	canRetry: boolean;
	errorState: AiChatAssistantErrorState;
	hasAssistantContent: boolean;
	onRetry?: () => void;
}) {
	return (
		<Message>
			<MessageContent>
				<Bubble variant="destructive">
					<BubbleContent className="flex flex-col items-start gap-3">
						<div className="flex items-start gap-2">
							<AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
							<p className="text-sm">
								{getChatErrorMessage({
									errorState,
									hasAssistantContent,
								})}
							</p>
						</div>
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
			pending: presentation.tailPending,
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

function isAiChatRowScrollAnchor(row: AiChatListRow) {
	return row.type === "message" && row.message.role === "user";
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
	if (errorState.classification === "context_overflow") {
		return "This chat got too large to finish. Try again or start a new chat.";
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
