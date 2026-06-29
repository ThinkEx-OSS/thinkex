import { Suspense, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import {
	MessageScroller,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "#/components/ui/message-scroller";
import {
	AiChatAttachmentDropProvider,
	useAiChatAttachmentDrop,
} from "#/features/workspaces/components/ai-chat/AiChatAttachmentDrop";
import AiChatPanelToolbar from "#/features/workspaces/components/ai-chat/AiChatPanelToolbar";
import AiChatThreadSkeleton from "#/features/workspaces/components/ai-chat/AiChatThreadSkeleton";
import AiChatThreadView from "#/features/workspaces/components/ai-chat/AiChatThreadView";
import AiChatTranscriptRail from "#/features/workspaces/components/ai-chat/AiChatTranscriptRail";
import {
	aiChatMessageScrollerContentClassName,
	aiChatMessageScrollerViewportClassName,
} from "#/features/workspaces/components/ai-chat/ai-chat-layout";
import { useAiChatPanelController } from "#/features/workspaces/components/ai-chat/useAiChatPanelController";
import { WorkspaceFileDropOverlay } from "#/features/workspaces/components/WorkspaceFileDropOverlay";
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context";

interface AiChatPanelProps {
	context: WorkspaceAiContextScope;
}

export default function AiChatPanel({ context }: AiChatPanelProps) {
	return (
		<AiChatAttachmentDropProvider>
			<AiChatPanelLayout context={context} />
		</AiChatAttachmentDropProvider>
	);
}

function AiChatPanelLayout({ context }: AiChatPanelProps) {
	const [activeThreadIsRecovering, setActiveThreadIsRecovering] = useState(false);
	const {
		activeThreadId,
		deleteThreadDialog,
		getThreadInspectorSnapshot,
		isCreatingThread,
		isMaximized,
		modelId,
		onClose,
		onDeleteThread,
		onMaximize,
		onModelChange,
		onNewChat,
		onRestore,
		onSelectThread,
		threads,
	} = useAiChatPanelController({ workspaceId: context.workspaceId });
	const { isDropActive, mergePanelRef } = useAiChatAttachmentDrop();

	return (
		<aside
			ref={mergePanelRef}
			className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background"
		>
			<AiChatPanelToolbar
				activeThreadId={activeThreadId}
				activeThreadIsRecovering={activeThreadIsRecovering}
				isMaximized={isMaximized}
				onClose={onClose}
				onDeleteThread={onDeleteThread}
				isNewChatDisabled={isCreatingThread}
				onNewChat={onNewChat}
				onMaximize={onMaximize}
				onRestore={onRestore}
				onSelectThread={onSelectThread}
				threads={threads}
			/>

			<Suspense key={activeThreadId} fallback={<AiChatPanelLoading />}>
				<AiChatThreadView
					context={context}
					getInspectorSnapshot={getThreadInspectorSnapshot}
					modelId={modelId}
					onModelChange={onModelChange}
					onRecoveringChange={setActiveThreadIsRecovering}
					threadSummary={threads.find((thread) => thread.id === activeThreadId)}
					threadId={activeThreadId}
				/>
			</Suspense>

			{isDropActive ? (
				<WorkspaceFileDropOverlay
					description="Images go into chat. Other supported files go into the workspace."
					title="Drop files here"
				/>
			) : null}

			<AlertDialog
				open={deleteThreadDialog.open}
				onOpenChange={deleteThreadDialog.onOpenChange}
				onOpenChangeComplete={(nextOpen) => {
					if (!nextOpen) {
						deleteThreadDialog.onClosed();
					}
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete chat?</AlertDialogTitle>
						<AlertDialogDescription>
							This cannot be undone.
							{deleteThreadDialog.thread
								? ` "${deleteThreadDialog.thread.title}" will be removed.`
								: ""}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								if (deleteThreadDialog.thread) {
									deleteThreadDialog.onConfirm(deleteThreadDialog.thread.id);
								}

								deleteThreadDialog.onOpenChange(false);
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</aside>
	);
}

function AiChatPanelLoading() {
	return (
		<MessageScrollerProvider>
			<MessageScroller className="h-full min-h-0">
				<MessageScrollerViewport className={aiChatMessageScrollerViewportClassName}>
					<MessageScrollerContent className={aiChatMessageScrollerContentClassName}>
						<MessageScrollerItem>
							<AiChatTranscriptRail>
								<AiChatThreadSkeleton />
							</AiChatTranscriptRail>
						</MessageScrollerItem>
					</MessageScrollerContent>
				</MessageScrollerViewport>
			</MessageScroller>
		</MessageScrollerProvider>
	);
}
