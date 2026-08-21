import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { aiChatThreadTranscriptQueryKey } from "#/features/workspaces/ai/chat/chat-queries";
import type { SerializedAiChatThreadTranscript } from "#/features/workspaces/ai/chat/functions";
import type { AiChatModelId } from "#/features/workspaces/components/ai-chat/types";
import { useWorkspaceAiChatThreads } from "#/features/workspaces/components/ai-chat/useWorkspaceAiChatThreads";
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
	const getOrCreateDraftAiChatThread = useWorkspaceUiStore(
		(state) => state.getOrCreateDraftAiChatThread,
	);
	const rotateDraftAiChatThread = useWorkspaceUiStore((state) => state.rotateDraftAiChatThread);
	const storedDraftThreadId = useWorkspaceUiStore(
		(state) => state.sessionsByWorkspaceId[workspaceId]?.draftAiChatThreadId,
	);
	const [threadViewEpoch, setThreadViewEpoch] = useState(0);
	const queryClient = useQueryClient();
	const {
		deleteThread,
		isReady: areThreadsReady,
		threads,
	} = useWorkspaceAiChatThreads({ workspaceId });

	// ChatGPT-style drafts: the active thread id may not exist server-side yet —
	// a thread row materializes when its first message is sent. The draft id is
	// random per browser (a deterministic per-workspace id collided across
	// members of shared workspaces) and persisted so refresh keeps the draft.
	const [fallbackDraftThreadId] = useState(() => crypto.randomUUID());
	const draftThreadId = storedDraftThreadId ?? fallbackDraftThreadId;

	useEffect(() => {
		getOrCreateDraftAiChatThread(workspaceId, fallbackDraftThreadId);
	}, [fallbackDraftThreadId, getOrCreateDraftAiChatThread, workspaceId]);

	const resolvedActiveThreadId = explicitActiveThreadId ?? draftThreadId;
	const activeThreadHasRow = threads.some((thread) => thread.id === resolvedActiveThreadId);
	const isMaximized = chatSurfaceMode === "fullscreen";

	const selectThread = (threadId: string | undefined) => {
		setActiveAiChatThread(workspaceId, threadId);
	};

	// A persisted "last visited" id can outlive its thread (deleted on another
	// device, or another account's leftover in this browser's storage). Once
	// the list has loaded, an explicit id with no row and a confirmed-empty
	// transcript is a dead pointer — fall back to the draft instead of pinning
	// the user to an unusable selection whose pristine guard also blocks
	// "new chat".
	useEffect(() => {
		if (!explicitActiveThreadId || !areThreadsReady) {
			return;
		}
		if (threads.some((thread) => thread.id === explicitActiveThreadId)) {
			return;
		}
		const transcript = queryClient.getQueryState<SerializedAiChatThreadTranscript>(
			aiChatThreadTranscriptQueryKey(explicitActiveThreadId),
		);
		if (transcript?.status === "success" && transcript.data?.messages.length === 0) {
			setActiveAiChatThread(workspaceId, undefined);
		}
	}, [
		areThreadsReady,
		explicitActiveThreadId,
		queryClient,
		setActiveAiChatThread,
		threads,
		workspaceId,
	]);

	// Once the draft's first message lands, its row appears in the thread list:
	// persist it as the active ("last visited") thread and mint a fresh draft,
	// so reopening the workspace returns to this conversation.
	useEffect(() => {
		if (!explicitActiveThreadId && threads.some((thread) => thread.id === draftThreadId)) {
			setActiveAiChatThread(workspaceId, draftThreadId);
			rotateDraftAiChatThread(workspaceId);
		}
	}, [
		draftThreadId,
		explicitActiveThreadId,
		rotateDraftAiChatThread,
		setActiveAiChatThread,
		threads,
		workspaceId,
	]);

	const handleNewChat = () => {
		// Repeated "new chat" on a pristine draft is a no-op rather than a pile
		// of drafts. "Pristine" = no server row and no local transcript (the
		// thread list can lag the first message by one refetch).
		const cachedTranscript = queryClient.getQueryData<SerializedAiChatThreadTranscript>(
			aiChatThreadTranscriptQueryKey(resolvedActiveThreadId),
		);
		const activeDraftHasMessages = (cachedTranscript?.messages.length ?? 0) > 0;

		if (!activeThreadHasRow && !activeDraftHasMessages) {
			return;
		}

		rotateDraftAiChatThread(workspaceId);
		selectThread(undefined);
	};

	const handleDeleteThread = async (threadId: string) => {
		const wasActive = resolvedActiveThreadId === threadId;

		if (wasActive) {
			// Land on a fresh draft, never on another conversation's history.
			rotateDraftAiChatThread(workspaceId);
			selectThread(undefined);
		}

		try {
			await deleteThread(threadId);
		} catch (error) {
			toast.error(getErrorMessage(error, "Unable to delete chat right now."));
			return;
		}

		useWorkspaceAiQueueStore.getState().clearThread(threadId);
		toast.success("Chat deleted.");
		if (wasActive) {
			setThreadViewEpoch((epoch) => epoch + 1);
		}
	};

	return {
		activeThreadId: resolvedActiveThreadId,
		// LOAD-BEARING: keying the thread view remounts it per thread (and per
		// delete-epoch), so per-thread view state — edit mode, scroll, animations,
		// the useChat instance — resets without any thread-change effects. New
		// per-thread state can rely on this instead of watching threadId.
		threadViewKey: `${resolvedActiveThreadId}:${threadViewEpoch}`,
		isLoading: !areThreadsReady,
		isMaximized,
		modelId,
		onClose: () => setChatSurfaceMode(workspaceId, "hidden"),
		onDeleteThread: (thread: AiChatThreadForDelete) => {
			void handleDeleteThread(thread.id);
		},
		onMaximize: () => setChatSurfaceMode(workspaceId, "fullscreen"),
		onModelChange: (nextModelId: AiChatModelId) => setAiChatModel(nextModelId),
		onNewChat: handleNewChat,
		onRestore: () => setChatSurfaceMode(workspaceId, "docked"),
		onSelectThread: (threadId: string) => selectThread(threadId),
		threads,
	};
}
