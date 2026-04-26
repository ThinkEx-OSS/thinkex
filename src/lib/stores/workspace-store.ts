import { create } from "zustand";
import { createJSONStorage, devtools, persist } from "zustand/middleware";

interface WorkspaceStoreState {
  currentWorkspaceId: string | null;
  currentThreadIdByWorkspace: Record<string, string>;
  setCurrentWorkspaceId: (id: string | null) => void;
  setCurrentThreadId: (workspaceId: string, threadId: string) => void;
  clearCurrentThreadId: (workspaceId: string, threadId?: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  devtools(
    persist(
      (set) => ({
        currentWorkspaceId: null,
        currentThreadIdByWorkspace: {},
        setCurrentWorkspaceId: (id) => set({ currentWorkspaceId: id }),
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

export const selectCurrentWorkspaceId = (state: WorkspaceStoreState) =>
  state.currentWorkspaceId;

export const selectCurrentThreadId =
  (workspaceId: string | null) => (state: WorkspaceStoreState) =>
    workspaceId ? state.currentThreadIdByWorkspace[workspaceId] : undefined;
