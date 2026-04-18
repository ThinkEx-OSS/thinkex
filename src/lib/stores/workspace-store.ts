import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface WorkspaceStoreState {
  currentWorkspaceId: string | null;
  setCurrentWorkspaceId: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  devtools(
    (set) => ({
      currentWorkspaceId: null,
      setCurrentWorkspaceId: (id) => set({ currentWorkspaceId: id }),
    }),
    { name: "Workspace Store" },
  ),
);

export const selectCurrentWorkspaceId = (state: WorkspaceStoreState) =>
  state.currentWorkspaceId;
