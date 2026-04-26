import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

export type ActiveChatThread =
  | { kind: "new"; id: string }
  | { kind: "persisted"; id: string };

interface WorkspaceStoreState {
  currentWorkspaceId: string | null;
  /**
   * Active chat thread per workspace for the current runtime session.
   *
   * Local "new" threads are client-generated UUIDs that become persisted on the
   * first chat write (see `/api/chat/route.ts`). This active selection stays
   * runtime-only so unsent local UUIDs are never restored after a refresh.
   */
  activeThreadByWorkspace: Record<string, ActiveChatThread>;
  /**
   * Last known persisted thread per workspace. This is the only chat-thread
   * state that survives reloads so each workspace can resume the most recently
   * opened saved conversation.
   */
  lastPersistedThreadIdByWorkspace: Record<string, string>;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  setCurrentWorkspaceId: (id: string | null) => void;
  setActiveThread: (workspaceId: string, thread: ActiveChatThread) => void;
  activatePersistedThread: (workspaceId: string, threadId: string) => void;
  clearActiveThread: (workspaceId: string) => void;
  clearLastPersistedThreadId: (
    workspaceId: string,
    threadId?: string,
  ) => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  devtools(
    persist(
      (set) => ({
        currentWorkspaceId: null,
        activeThreadByWorkspace: {},
        lastPersistedThreadIdByWorkspace: {},
        hasHydrated: false,
        setHasHydrated: (value) => set({ hasHydrated: value }),
        setCurrentWorkspaceId: (id) => set({ currentWorkspaceId: id }),
        setActiveThread: (workspaceId, thread) =>
          set((state) => ({
            activeThreadByWorkspace: {
              ...state.activeThreadByWorkspace,
              [workspaceId]: thread,
            },
            ...(thread.kind === "persisted"
              ? {
                  lastPersistedThreadIdByWorkspace: {
                    ...state.lastPersistedThreadIdByWorkspace,
                    [workspaceId]: thread.id,
                  },
                }
              : {}),
          })),
        activatePersistedThread: (workspaceId, threadId) =>
          set((state) => ({
            activeThreadByWorkspace: {
              ...state.activeThreadByWorkspace,
              [workspaceId]: { kind: "persisted", id: threadId },
            },
            lastPersistedThreadIdByWorkspace: {
              ...state.lastPersistedThreadIdByWorkspace,
              [workspaceId]: threadId,
            },
          })),
        clearActiveThread: (workspaceId) =>
          set((state) => {
            const next = { ...state.activeThreadByWorkspace };
            delete next[workspaceId];
            return { activeThreadByWorkspace: next };
          }),
        clearLastPersistedThreadId: (workspaceId, threadId) =>
          set((state) => {
            const currentLast =
              state.lastPersistedThreadIdByWorkspace[workspaceId];
            if (threadId && currentLast !== threadId) {
              return {};
            }
            const next = { ...state.lastPersistedThreadIdByWorkspace };
            delete next[workspaceId];
            return { lastPersistedThreadIdByWorkspace: next };
          }),
      }),
      {
        name: "thinkex-workspace-thread-state-v1",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          lastPersistedThreadIdByWorkspace:
            state.lastPersistedThreadIdByWorkspace,
        }),
        onRehydrateStorage: () => (state) => {
          state?.setHasHydrated(true);
        },
      },
    ),
    { name: "Workspace Store" },
  ),
);

export const selectCurrentWorkspaceId = (state: WorkspaceStoreState) =>
  state.currentWorkspaceId;

export const selectActiveThread =
  (workspaceId: string | null) => (state: WorkspaceStoreState) =>
    workspaceId ? state.activeThreadByWorkspace[workspaceId] : undefined;

export const selectCurrentThreadId =
  (workspaceId: string | null) => (state: WorkspaceStoreState) =>
    workspaceId ? state.activeThreadByWorkspace[workspaceId]?.id : undefined;

export const selectLastPersistedThreadId =
  (workspaceId: string | null) => (state: WorkspaceStoreState) =>
    workspaceId
      ? state.lastPersistedThreadIdByWorkspace[workspaceId]
      : undefined;
