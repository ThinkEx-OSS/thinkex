import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getDefaultWorkspaceThreadId } from "#/features/workspaces/ai/ai-thread-identity";
import type { AiChatModelId } from "#/features/workspaces/components/ai-chat/types";
import { useWorkspaceAiChatThreads } from "#/features/workspaces/components/ai-chat/useWorkspaceAiChatThreads";
import { evictWorkspaceAiTranscript } from "#/features/workspaces/components/ai-chat/useWorkspaceAiChat";
import {
	useWorkspaceActiveAiChatThreadId,
	useWorkspaceAiChatModelId,
	useWorkspaceAiChatSurfaceMode,
	useWorkspaceUiStore,
} from "#/features/workspaces/state/workspace-ui-store";
import { useWorkspaceAiQueueStore } from "#/features/workspaces/state/workspace-ai-queue-store";
import { getErrorMessage } from "#/lib/error-message";

type UseAiChatPanelControllerInput = {
	workspaceId: string;
};

type AiChatThreadForDelete = {
	id: string;
	title: string;
};

export function useAiChatPanelController({ workspaceId }: UseAiChatPanelControllerInput) {
	const chatSurfaceMode = useWorkspaceAiChatSurfaceMode(workspaceId);
	const explicitActiveThreadId = useWorkspaceActiveAiChatThreadId(workspaceId);
	const modelId = useWorkspaceAiChatModelId();
	const setChatSurfaceMode = useWorkspaceUiStore((state) => state.setChatSurfaceMode);
	const setActiveAiChatThread = useWorkspaceUiStore((state) => state.setActiveAiChatThread);
	const setAiChatModel = useWorkspaceUiStore((state) => state.setAiChatModel);
	const [markingViewedThreadIds] = useState(() => new Set<string>());
	const [threadViewEpoch, setThreadViewEpoch] = useState(0);
	const {
		createThread,
		deleteThread,
		isCreatingThread,
		isReady: areThreadsReady,
		markThreadViewed,
		threads,
	} = useWorkspaceAiChatThreads({ workspaceId });
	const defaultThreadId = getDefaultWorkspaceThreadId(workspaceId);
	const resolvedActiveThreadId = explicitActiveThreadId ?? defaultThreadId;
	const activeThread = threads.find((thread) => thread.id === resolvedActiveThreadId);
	const isMaximized = chatSurfaceMode === "fullscreen";

	const selectThread = (threadId: string | undefined) => {
		setActiveAiChatThread(workspaceId, threadId);
	};

	const handleNewChat = async () => {
		if (isCreatingThread) {
			return;
		}

		try {
			const thread = await createThread();
			selectThread(thread.id);
		} catch (error) {
			toast.error(getErrorMessage(error, "Unable to start a new chat right now."));
		}
	};

	const handleDeleteThread = async (threadId: string) => {
		// The thread's socket lives on the directory DO, so deleting the thread
		// never closes it — a still-mounted view keeps a zombie transcript whose
		// next frame resurrects the deleted thread (cloudflare/agents#2003).
		// Switch away first; when nothing survives, remount the view after the
		// delete so it reconnects to a fresh default thread.
		const wasActive = resolvedActiveThreadId === threadId;
		const survivorId = wasActive ? threads.find((thread) => thread.id !== threadId)?.id : undefined;

		if (wasActive) {
			selectThread(survivorId);
		}

		try {
			await deleteThread(threadId);
		} catch (error) {
			// No selection restore: the thread is still in the list, and the user
			// may have moved on during the in-flight delete.
			toast.error(getErrorMessage(error, "Unable to delete chat right now."));
			return;
		}

		useWorkspaceAiQueueStore.getState().clearThread(threadId);
		evictWorkspaceAiTranscript(threadId);
		toast.success("Chat deleted.");
		if (wasActive && !survivorId) {
			setThreadViewEpoch((epoch) => epoch + 1);
		}
	};

	useEffect(() => {
		if (!areThreadsReady) {
			return;
		}

		if (threads.length === 0) {
			if (explicitActiveThreadId) {
				setActiveAiChatThread(workspaceId, undefined);
			}
			return;
		}

		if (explicitActiveThreadId && !threads.some((thread) => thread.id === explicitActiveThreadId)) {
			setActiveAiChatThread(workspaceId, undefined);
		}
	}, [areThreadsReady, explicitActiveThreadId, setActiveAiChatThread, threads, workspaceId]);

	useEffect(() => {
		if (!activeThread?.hasUnreadUpdate) {
			return;
		}

		if (markingViewedThreadIds.has(activeThread.id)) {
			return;
		}

		markingViewedThreadIds.add(activeThread.id);
		void markThreadViewed(activeThread.id).finally(() => {
			markingViewedThreadIds.delete(activeThread.id);
		});
	}, [activeThread?.hasUnreadUpdate, activeThread?.id, markingViewedThreadIds, markThreadViewed]);

	return {
		activeThreadId: resolvedActiveThreadId,
		threadViewKey: `${resolvedActiveThreadId}:${threadViewEpoch}`,
		isCreatingThread,
		isLoading: !areThreadsReady,
		isMaximized,
		modelId,
		onClose: () => setChatSurfaceMode(workspaceId, "hidden"),
		onDeleteThread: (thread: AiChatThreadForDelete) => {
			void handleDeleteThread(thread.id);
		},
		onMaximize: () => setChatSurfaceMode(workspaceId, "fullscreen"),
		onModelChange: (nextModelId: AiChatModelId) => setAiChatModel(nextModelId),
		onNewChat: () => void handleNewChat(),
		onRestore: () => setChatSurfaceMode(workspaceId, "docked"),
		onSelectThread: (threadId: string) => selectThread(threadId),
		threads: threads.map((thread) =>
			thread.id === resolvedActiveThreadId ? { ...thread, hasUnreadUpdate: false } : thread,
		),
	};
}
