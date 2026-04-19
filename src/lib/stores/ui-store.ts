import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { PANEL_DEFAULTS } from "@/lib/layout-constants";

export type WorkspaceItemSlot = "primary" | "secondary";

export interface OpenWorkspaceItems {
  primary: string | null;
  secondary: string | null;
}

export type WorkspaceOpenMode = "grid" | "single" | "split";

export function deriveWorkspaceOpenMode(
  openItems: OpenWorkspaceItems,
): WorkspaceOpenMode {
  const hasPrimary = openItems.primary != null;
  const hasSecondary = openItems.secondary != null;
  if (!hasPrimary && !hasSecondary) return "grid";
  if (hasPrimary && hasSecondary) return "split";
  return "single";
}

const emptyOpenItems = (): OpenWorkspaceItems => ({
  primary: null,
  secondary: null,
});

interface UIState {
  isChatExpanded: boolean;
  isChatMaximized: boolean;
  isThreadListVisible: boolean;

  workspacePanelSize: number;

  openItems: OpenWorkspaceItems;
  activeWorkspaceItemSlot: WorkspaceItemSlot;

  itemPrompt: { itemId: string; x: number; y: number } | null;

  showCreateWorkspaceModal: boolean;
  showSheetModal: boolean;

  activeFolderId: string | null;

  selectedCardIds: Set<string>;

  itemScrollLocked: Map<string, boolean>;

  setIsChatExpanded: (expanded: boolean) => void;
  toggleChatExpanded: () => void;
  setIsChatMaximized: (maximized: boolean) => void;
  toggleChatMaximized: () => void;
  setIsThreadListVisible: (visible: boolean) => void;
  toggleThreadListVisible: () => void;
  setWorkspacePanelSize: (size: number) => void;

  openWorkspaceItem: (itemId: string | null) => void;
  setWorkspaceSecondaryItem: (itemId: string | null) => void;
  closeWorkspaceItem: (itemId: string) => void;
  closeAllWorkspaceItems: () => void;
  setActiveWorkspaceItemSlot: (slot: WorkspaceItemSlot) => void;
  setItemPrompt: (
    prompt: { itemId: string; x: number; y: number } | null,
  ) => void;

  setShowCreateWorkspaceModal: (show: boolean) => void;
  setShowSheetModal: (show: boolean) => void;

  setActiveFolderId: (folderId: string | null) => void;
  navigateToRoot: () => void;
  navigateToFolder: (folderId: string) => void;
  _setActiveFolderIdDirect: (folderId: string | null) => void;
  _setOpenItemsFromUrl: (ids: string[]) => void;

  toggleCardSelection: (id: string) => void;
  clearCardSelection: () => void;
  selectMultipleCards: (ids: string[]) => void;

  setItemScrollLocked: (itemId: string, isLocked: boolean) => void;
  toggleItemScrollLocked: (itemId: string) => void;

  resetChatState: () => void;
  closeAllModals: () => void;
}

const initialState = {
  isChatExpanded: true,
  isChatMaximized: false,
  isThreadListVisible: false,
  workspacePanelSize: PANEL_DEFAULTS.WORKSPACE_WITH_CHAT,
  openItems: emptyOpenItems(),
  activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
  itemPrompt: null,
  showCreateWorkspaceModal: false,
  showSheetModal: false,
  activeFolderId: null,
  selectedCardIds: new Set<string>(),
  itemScrollLocked: new Map<string, boolean>(),
};

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        setActiveFolderId: (folderId) => set({ activeFolderId: folderId }),

        navigateToRoot: () => {
          set((state) => {
            if (
              state.activeFolderId === null &&
              deriveWorkspaceOpenMode(state.openItems) === "grid"
            ) {
              return {};
            }
            return {
              activeFolderId: null,
              openItems: emptyOpenItems(),
              activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
            };
          });
        },

        navigateToFolder: (folderId) => {
          set((state) => {
            if (
              state.activeFolderId === folderId &&
              deriveWorkspaceOpenMode(state.openItems) === "grid"
            ) {
              return {};
            }
            return {
              activeFolderId: folderId,
              openItems: emptyOpenItems(),
              activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
            };
          });
        },

        _setActiveFolderIdDirect: (folderId) =>
          set({ activeFolderId: folderId }),

        _setOpenItemsFromUrl: (ids) =>
          set(() => {
            const valid = ids.filter(Boolean).slice(0, 2);
            if (valid.length === 0) {
              return {
                openItems: emptyOpenItems(),
                activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
              };
            }
            const primary = valid[0] ?? null;
            const secondary = valid.length >= 2 ? valid[1]! : null;
            return {
              openItems: { primary, secondary },
              activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
            };
          }),

        openWorkspaceItem: (id) => {
          set((state) => {
            if (id === null) {
              if (deriveWorkspaceOpenMode(state.openItems) === "grid") {
                return {};
              }
              return {
                openItems: emptyOpenItems(),
                activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
              };
            }
            if (
              state.openItems.primary === id &&
              state.openItems.secondary === null
            ) {
              return {};
            }
            return {
              openItems: { primary: id, secondary: null },
              activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
            };
          });
        },

        setWorkspaceSecondaryItem: (id) => {
          set((state) => {
            if (state.openItems.primary == null) return {};
            if (id != null && id === state.openItems.primary) return {};
            if (id === state.openItems.secondary) return {};
            return {
              openItems: { primary: state.openItems.primary, secondary: id },
              activeWorkspaceItemSlot: id
                ? state.activeWorkspaceItemSlot
                : "primary",
            };
          });
        },

        closeWorkspaceItem: (itemId) => {
          set((state) => {
            const { primary, secondary } = state.openItems;
            if (primary !== itemId && secondary !== itemId) {
              return {};
            }
            if (primary === itemId) {
              return {
                openItems: emptyOpenItems(),
                activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
              };
            }
            return {
              openItems: { primary, secondary: null },
              activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
            };
          });
        },

        closeAllWorkspaceItems: () => {
          set((state) => {
            if (deriveWorkspaceOpenMode(state.openItems) === "grid") return {};
            return {
              openItems: emptyOpenItems(),
              activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
            };
          });
        },

        setActiveWorkspaceItemSlot: (slot) =>
          set({ activeWorkspaceItemSlot: slot }),

        setItemPrompt: (prompt) => set({ itemPrompt: prompt }),

        setShowCreateWorkspaceModal: (show) =>
          set({ showCreateWorkspaceModal: show }),
        setShowSheetModal: (show) => set({ showSheetModal: show }),

        toggleCardSelection: (id) =>
          set((state) => {
            const newSet = new Set(state.selectedCardIds);
            if (newSet.has(id)) {
              newSet.delete(id);
            } else {
              newSet.add(id);
            }
            return { selectedCardIds: newSet };
          }),

        clearCardSelection: () => set({ selectedCardIds: new Set<string>() }),

        selectMultipleCards: (ids) => set({ selectedCardIds: new Set(ids) }),

        setItemScrollLocked: (itemId, isLocked) =>
          set((state) => {
            const newMap = new Map(state.itemScrollLocked);
            newMap.set(itemId, isLocked);
            return { itemScrollLocked: newMap };
          }),
        toggleItemScrollLocked: (itemId) =>
          set((state) => {
            const newMap = new Map(state.itemScrollLocked);
            const current = newMap.get(itemId) ?? true;
            newMap.set(itemId, !current);
            return { itemScrollLocked: newMap };
          }),

        resetChatState: () =>
          set({
            isChatExpanded: initialState.isChatExpanded,
            isChatMaximized: initialState.isChatMaximized,
            workspacePanelSize: initialState.workspacePanelSize,
          }),

        setIsChatExpanded: (expanded) => set({ isChatExpanded: expanded }),
        toggleChatExpanded: () =>
          set((state) => ({ isChatExpanded: !state.isChatExpanded })),
        setIsChatMaximized: (maximized) => set({ isChatMaximized: maximized }),
        toggleChatMaximized: () =>
          set((state) => ({ isChatMaximized: !state.isChatMaximized })),
        setIsThreadListVisible: (visible) =>
          set({ isThreadListVisible: visible }),
        toggleThreadListVisible: () =>
          set((state) => ({ isThreadListVisible: !state.isThreadListVisible })),
        setWorkspacePanelSize: (size) => set({ workspacePanelSize: size }),

        closeAllModals: () =>
          set({
            openItems: emptyOpenItems(),
            activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
            itemPrompt: null,
            showCreateWorkspaceModal: false,
            showSheetModal: false,
          }),
      }),
      {
        name: "thinkex-ui-preferences-v3",
        storage: createJSONStorage(() => localStorage),
        partialize: () => ({}),
      },
    ),
    { name: "UI Store" },
  ),
);

export const selectWorkspaceOpenMode = (state: UIState) =>
  deriveWorkspaceOpenMode(state.openItems);

export const selectSelectedCardIdsArray = (state: UIState): string[] => {
  return Array.from(state.selectedCardIds).sort();
};

export const selectItemScrollLocked =
  (itemId: string) =>
  (state: UIState): boolean => {
    return state.itemScrollLocked.get(itemId) ?? true;
  };
