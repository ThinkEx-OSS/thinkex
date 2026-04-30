import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

/**
 * Persistent UI state keyed by workspace.
 *
 * NOTE: `currentWorkspaceId` is intentionally NOT in this store. The active
 * workspace is derived from the URL slug inside `WorkspaceContext`; mirroring
 * it into Zustand would create two sources of truth and cascading renders.
 * Read it via `useCurrentWorkspaceId()` from `@/contexts/WorkspaceContext`.
 */
interface WorkspaceStoreState {
  currentThreadIdByWorkspace: Record<string, string>;
  setCurrentThreadId: (workspaceId: string, threadId: string) => void;
  clearCurrentThreadId: (workspaceId: string, threadId?: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  devtools(
    persist(
      (set) => ({
        currentThreadIdByWorkspace: {},
        setCurrentThreadId: (workspaceId, threadId) =>
          set((state) => ({
            currentThreadIdByWorkspace: {
              ...state.currentThreadIdByWorkspace,
              [workspaceId]: threadId,
            },
          })),
        clearCurrentThreadId: (workspaceId, threadId) =>
          set((state) => {
            const currentThreadId = state.currentThreadIdByWorkspace[workspaceId];
            if (threadId && currentThreadId !== threadId) {
              return {};
            }
            const next = { ...state.currentThreadIdByWorkspace };
            delete next[workspaceId];
            return { currentThreadIdByWorkspace: next };
          }),
      }),
      {
        name: "thinkex-workspace-thread-state-v1",
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({
          currentThreadIdByWorkspace: state.currentThreadIdByWorkspace,
        }),
      },
    ),
    { name: "Workspace Store" },
  ),
);

export const selectCurrentThreadId =
  (workspaceId: string | null) => (state: WorkspaceStoreState) =>
    workspaceId ? state.currentThreadIdByWorkspace[workspaceId] : undefined;
