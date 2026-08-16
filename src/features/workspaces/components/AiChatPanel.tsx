import { Suspense, useState } from "react";
import {
	AiChatAttachmentDropProvider,
	useAiChatAttachmentDrop,
} from "#/features/workspaces/components/ai-chat/AiChatAttachmentDrop";
import AiChatPanelToolbar from "#/features/workspaces/components/ai-chat/AiChatPanelToolbar";
import AiChatThreadSkeleton from "#/features/workspaces/components/ai-chat/AiChatThreadSkeleton";
import AiChatThreadView from "#/features/workspaces/components/ai-chat/AiChatThreadView";
import AiChatTranscriptRail from "#/features/workspaces/components/ai-chat/AiChatTranscriptRail";
import { aiChatMessageScrollerContentClassName } from "#/features/workspaces/components/ai-chat/ai-chat-layout";
import { useAiChatPanelController } from "#/features/workspaces/components/ai-chat/useAiChatPanelController";
import { WorkspaceFileDropOverlay } from "#/features/workspaces/components/WorkspaceFileDropOverlay";
import type { WorkspaceAiContextScope } from "#/features/workspaces/model/workspace-ai-context-types";
import { cn } from "#/lib/utils";

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
		threadViewKey,
		isCreatingThread,
		isLoading,
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
				isLoading={isLoading}
				isNewChatDisabled={isCreatingThread}
				onNewChat={onNewChat}
				onMaximize={onMaximize}
				onRestore={onRestore}
				onSelectThread={onSelectThread}
				threads={threads}
			/>

			<Suspense key={threadViewKey} fallback={<AiChatPanelLoading />}>
				<AiChatThreadView
					context={context}
					modelId={modelId}
					onModelChange={onModelChange}
					onRecoveringChange={setActiveThreadIsRecovering}
					onStartNewChat={onNewChat}
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
		</aside>
	);
}

// A skeleton never scrolls, so it borrows the transcript's spacing rather than
// its scroller.
function AiChatPanelLoading() {
	return (
		<div className={cn("h-full min-h-0 overflow-hidden", aiChatMessageScrollerContentClassName)}>
			<AiChatTranscriptRail>
				<AiChatThreadSkeleton />
			</AiChatTranscriptRail>
		</div>
	);
}
