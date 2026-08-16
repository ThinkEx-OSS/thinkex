import type { FileUIPart } from "ai";
import { nanoid } from "nanoid";
import { useMemo } from "react";
import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { deleteWorkspaceAiChatAttachment } from "#/features/workspaces/components/ai-chat/chat-attachment-upload";
import type { WorkspaceAiContextSnapshot } from "#/features/workspaces/model/workspace-ai-context-types";
import { zustandDevtoolsOptions } from "#/lib/zustand-devtools";

/**
 * A composer message waiting to be sent once the AI finishes its current
 * response. Files are already uploaded (the entry owns their R2 objects until
 * it is sent, discarded, or edited back into the draft). The context snapshot
 * is captured at enqueue time so the message is answered against what the user
 * was looking at when they wrote it; entries without one (action prompts) get
 * a live snapshot at send time.
 */
export type WorkspaceAiQueuedMessage = {
	id: string;
	text: string;
	files: FileUIPart[];
	contextSnapshot?: WorkspaceAiContextSnapshot;
	promoted: boolean;
};

interface WorkspaceAiQueueState {
	queuesByThreadId: Record<string, WorkspaceAiQueuedMessage[] | undefined>;
	pausedByThreadId: Record<string, true | undefined>;
	enqueue: (
		threadId: string,
		input: {
			text: string;
			files?: FileUIPart[];
			contextSnapshot?: WorkspaceAiContextSnapshot;
			atHead?: boolean;
		},
	) => string | null;
	/** Compare-and-swap take: only succeeds while the entry is still the head. */
	takeHead: (threadId: string, entryId: string) => WorkspaceAiQueuedMessage | null;
	restoreAtHead: (threadId: string, entry: WorkspaceAiQueuedMessage) => void;
	/** Removes without deleting attachments; the caller takes ownership. */
	remove: (threadId: string, entryId: string) => WorkspaceAiQueuedMessage | null;
	/** Removes and deletes the entry's uploaded attachments. */
	discard: (threadId: string, entryId: string) => void;
	/** Clears one deleted thread and discards every attachment still queued for it. */
	clearThread: (threadId: string) => void;
	moveToHead: (threadId: string, entryId: string) => void;
	moveByIndex: (threadId: string, fromIndex: number, toIndex: number) => void;
	pause: (threadId: string) => void;
	resume: (threadId: string) => void;
}

const EMPTY_QUEUE: WorkspaceAiQueuedMessage[] = [];

export const useWorkspaceAiQueueStore = create<WorkspaceAiQueueState>()(
	devtools(
		(set, get) => ({
			queuesByThreadId: {},
			pausedByThreadId: {},
			enqueue: (threadId, input) => {
				const text = input.text.trim();
				const files = input.files ?? [];
				if (!text && files.length === 0) {
					return null;
				}

				const entry: WorkspaceAiQueuedMessage = {
					contextSnapshot: input.contextSnapshot,
					files,
					id: nanoid(),
					promoted: input.atHead ?? false,
					text,
				};
				set((state) => {
					const current = state.queuesByThreadId[threadId] ?? EMPTY_QUEUE;
					return withQueue(
						state,
						threadId,
						input.atHead ? [entry, ...current] : [...current, entry],
					);
				});
				return entry.id;
			},
			takeHead: (threadId, entryId) => {
				const current = get().queuesByThreadId[threadId] ?? EMPTY_QUEUE;
				const head = current[0];
				if (!head || head.id !== entryId) {
					return null;
				}

				set((state) => withQueue(state, threadId, current.slice(1)));
				return head;
			},
			restoreAtHead: (threadId, entry) =>
				set((state) =>
					withQueue(state, threadId, [entry, ...(state.queuesByThreadId[threadId] ?? EMPTY_QUEUE)]),
				),
			remove: (threadId, entryId) => {
				const current = get().queuesByThreadId[threadId] ?? EMPTY_QUEUE;
				const entry = current.find((item) => item.id === entryId);
				if (!entry) {
					return null;
				}

				set((state) =>
					withQueue(
						state,
						threadId,
						current.filter((item) => item.id !== entryId),
					),
				);
				return entry;
			},
			discard: (threadId, entryId) => {
				const entry = get().remove(threadId, entryId);
				if (!entry) {
					return;
				}

				for (const file of entry.files) {
					void discardQueuedAttachment(file.url);
				}
			},
			clearThread: (threadId) => {
				const entries = get().queuesByThreadId[threadId] ?? EMPTY_QUEUE;
				set((state) => {
					const queuesByThreadId = { ...state.queuesByThreadId };
					const pausedByThreadId = { ...state.pausedByThreadId };
					delete queuesByThreadId[threadId];
					delete pausedByThreadId[threadId];

					return { pausedByThreadId, queuesByThreadId };
				});
				for (const entry of entries) {
					for (const file of entry.files) {
						void discardQueuedAttachment(file.url);
					}
				}
			},
			moveToHead: (threadId, entryId) =>
				set((state) => {
					const current = state.queuesByThreadId[threadId] ?? EMPTY_QUEUE;
					const entry = current.find((item) => item.id === entryId);
					if (!entry) {
						return state;
					}

					return withQueue(state, threadId, [
						{ ...entry, promoted: true },
						...current.filter((item) => item.id !== entryId),
					]);
				}),
			moveByIndex: (threadId, fromIndex, toIndex) =>
				set((state) => {
					const current = state.queuesByThreadId[threadId] ?? EMPTY_QUEUE;
					const boundedToIndex = Math.max(0, Math.min(toIndex, current.length - 1));
					if (fromIndex < 0 || fromIndex >= current.length || fromIndex === boundedToIndex) {
						return state;
					}

					const next = current.slice();
					const [moved] = next.splice(fromIndex, 1);
					if (!moved) {
						return state;
					}

					next.splice(boundedToIndex, 0, moved);
					return withQueue(state, threadId, next);
				}),
			pause: (threadId) =>
				set((state) => ({
					pausedByThreadId: { ...state.pausedByThreadId, [threadId]: true },
				})),
			resume: (threadId) =>
				set((state) => {
					if (!state.pausedByThreadId[threadId]) {
						return state;
					}

					return {
						pausedByThreadId: { ...state.pausedByThreadId, [threadId]: undefined },
					};
				}),
		}),
		zustandDevtoolsOptions("WorkspaceAiQueueStore"),
	),
);

export function useWorkspaceAiQueue(threadId: string) {
	return useWorkspaceAiQueueStore(
		useMemo(
			() => (state: WorkspaceAiQueueState) => state.queuesByThreadId[threadId] ?? EMPTY_QUEUE,
			[threadId],
		),
	);
}

export function useWorkspaceAiQueueHead(threadId: string) {
	return useWorkspaceAiQueueStore(
		useMemo(
			() => (state: WorkspaceAiQueueState) => state.queuesByThreadId[threadId]?.[0],
			[threadId],
		),
	);
}

export function useWorkspaceAiQueuePaused(threadId: string) {
	return useWorkspaceAiQueueStore(
		useMemo(
			() => (state: WorkspaceAiQueueState) => state.pausedByThreadId[threadId] ?? false,
			[threadId],
		),
	);
}

function withQueue(
	state: WorkspaceAiQueueState,
	threadId: string,
	queue: WorkspaceAiQueuedMessage[],
) {
	return {
		queuesByThreadId: {
			...state.queuesByThreadId,
			[threadId]: queue.length > 0 ? queue : undefined,
		},
	};
}

async function discardQueuedAttachment(url: string) {
	try {
		await deleteWorkspaceAiChatAttachment(url);
	} catch {
		// Thread and workspace deletion provide a final cleanup path.
	}
}
