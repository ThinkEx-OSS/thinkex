import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface WorkspaceStoreState {
  currentWorkspaceId: string | null;
  /**
   * Active chat thread id per workspace. Threads are client-generated UUIDs
   * persisted server-side on first write (see `/api/chat/route.ts`).
   *
   * Stored per-workspace so switching workspaces does not collide. We do not
   * persist this across page reloads on purpose — every fresh session starts
   * a new thread; the thread list dropdown is the way back into history.
   */
  currentThreadIdByWorkspace: Record<string, string>;
  setCurrentWorkspaceId: (id: string | null) => void;
  setCurrentThreadId: (workspaceId: string, threadId: string) => void;
  clearCurrentThreadId: (workspaceId: string) => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  devtools(
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
      clearCurrentThreadId: (workspaceId) =>
        set((state) => {
          const next = { ...state.currentThreadIdByWorkspace };
          delete next[workspaceId];
          return { currentThreadIdByWorkspace: next };
        }),
    }),
    { name: "Workspace Store" },
  ),
);

export const selectCurrentWorkspaceId = (state: WorkspaceStoreState) =>
  state.currentWorkspaceId;

export const selectCurrentThreadId =
  (workspaceId: string | null) => (state: WorkspaceStoreState) =>
    workspaceId ? state.currentThreadIdByWorkspace[workspaceId] : undefined;
