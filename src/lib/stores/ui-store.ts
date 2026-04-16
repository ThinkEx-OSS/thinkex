import { create } from "zustand";
import { devtools, persist, createJSONStorage } from "zustand/middleware";
import { PANEL_DEFAULTS } from "@/lib/layout-constants";
import { getDefaultChatModelId } from "@/lib/ai/models";

/**
 * UI Store - Manages all UI state (chat, modals, search, layout, reply context)
 * This replaces scattered useState hooks in dashboard
 */

/** Column / keyboard focus when two items are open (split). */
export type WorkspaceItemSlot = "primary" | "secondary";

/**
 * Up to two workspace items “open” at once.
 * - Today: only `primary` is used; UI is fullscreen one-item view.
 * - Split: set `secondary` while `primary` is set → mode becomes `split` (side-by-side UI).
 */
export interface OpenWorkspaceItems {
  primary: string | null;
  secondary: string | null;
}

/**
 * How the main workspace area is used — derived from `openItems`, not stored.
 * - `grid` — card/folder canvas only
 * - `single` — one item fullscreen (see OpenWorkspaceItemView)
 * - `split` — two items side by side (future)
 */
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

/** Quoted passage attached to the composer as reply / “referring to” context. */
export interface ReplySelection {
  text: string;
  title?: string;
}

const emptyOpenItems = (): OpenWorkspaceItems => ({
  primary: null,
  secondary: null,
});

interface UIState {
  // Chat state
  isChatExpanded: boolean;
  isChatMaximized: boolean;
  isThreadListVisible: boolean;

  // Layout state
  workspacePanelSize: number; // percentage (0-100)

  openItems: OpenWorkspaceItems;
  /** Focused slot for keyboard / a11y when split; still meaningful when only primary is open */
  activeWorkspaceItemSlot: WorkspaceItemSlot;

  itemPrompt: { itemId: string; x: number; y: number } | null; // Global prompt state

  // Modal state
  showCreateWorkspaceModal: boolean;
  showSheetModal: boolean;

  activeFolderId: string | null; // Active folder for filtering
  selectedModelId: string; // Selected AI model ID
  memoryEnabled: boolean; // Supermemory: inject user profile + auto-save conversations

  // Card selection state (user actions only — opening a panel does not change selection)
  selectedCardIds: Set<string>;

  // Scroll lock state per item (itemId -> isScrollLocked)
  itemScrollLocked: Map<string, boolean>;

  // Reply selection state
  replySelections: ReplySelection[];

  // Citation highlight: when opening document/PDF from citation click, highlight/search this quote
  citationHighlightQuery: {
    itemId: string;
    query: string;
    pageNumber?: number;
  } | null;

  // PDF active page: itemId -> current page when PDF is open (for selected-card context)
  activePdfPageByItemId: Record<string, number>;

  // Actions - Chat
  setIsChatExpanded: (expanded: boolean) => void;
  toggleChatExpanded: () => void;
  setIsChatMaximized: (maximized: boolean) => void;
  toggleChatMaximized: () => void;
  setIsThreadListVisible: (visible: boolean) => void;
  toggleThreadListVisible: () => void;
  setWorkspacePanelSize: (size: number) => void;

  // Actions - Open workspace items (overlay today; split when secondary is set)
  /** Open primary item fullscreen, or null to close everything and return to grid. Clears secondary. */
  openWorkspaceItem: (itemId: string | null) => void;
  /**
   * Second item for split view. Pass null to clear secondary only.
   * No-op if primary is empty (secondary never stands alone).
   */
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
  /** Atomic: close panels and clear folder. Use when panel is focused and user navigates back. */
  navigateToRoot: () => void;
  /** Atomic: close panels and set folder. Use when panel is focused and user navigates back. */
  navigateToFolder: (folderId: string) => void;
  /** URL sync only — sets folder without touching panels */
  _setActiveFolderIdDirect: (folderId: string | null) => void;
  /** URL sync only — restores open items from `items` query (up to two ids for split) */
  _setOpenItemsFromUrl: (ids: string[]) => void;
  setSelectedModelId: (modelId: string) => void;
  setMemoryEnabled: (enabled: boolean) => void;

  // Actions - Card selection
  toggleCardSelection: (id: string) => void;
  clearCardSelection: () => void;
  selectMultipleCards: (ids: string[]) => void;

  // Actions - Scroll lock state
  setItemScrollLocked: (itemId: string, isLocked: boolean) => void;
  toggleItemScrollLocked: (itemId: string) => void;

  // Actions - Reply selection
  addReplySelection: (selection: ReplySelection) => void;
  removeReplySelection: (index: number) => void;
  clearReplySelections: () => void;
  setCitationHighlightQuery: (
    query: { itemId: string; query: string; pageNumber?: number } | null,
  ) => void;
  setActivePdfPage: (itemId: string, page: number | null) => void;

  // Utility actions
  resetChatState: () => void;
  closeAllModals: () => void;
}

const initialState = {
  // Chat
  isChatExpanded: true,
  isChatMaximized: false,
  isThreadListVisible: false,

  // Layout
  workspacePanelSize: PANEL_DEFAULTS.WORKSPACE_WITH_CHAT, // Default when chat is expanded

  openItems: emptyOpenItems(),
  activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,

  itemPrompt: null,

  showCreateWorkspaceModal: false,
  showSheetModal: false,

  activeFolderId: null,
  selectedModelId: getDefaultChatModelId(),
  memoryEnabled: true,

  // Card selection
  selectedCardIds: new Set<string>(),

  // Scroll lock state
  itemScrollLocked: new Map<string, boolean>(),

  // Reply selection
  replySelections: [],
  citationHighlightQuery: null,
  activePdfPageByItemId: {},
};

export const useUIStore = create<UIState>()(
  devtools(
    persist(
      (set) => ({
        ...initialState,

        // Folder-only setter — for folder switching (sidebar, workspace content). Never touches panels.
        setActiveFolderId: (folderId) => set({ activeFolderId: folderId }),

        navigateToRoot: () => {
          set((state) => {
            if (
              state.activeFolderId === null &&
              deriveWorkspaceOpenMode(state.openItems) === "grid"
            )
              return {};
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
            )
              return {};
            return {
              activeFolderId: folderId,
              openItems: emptyOpenItems(),
              activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
            };
          });
        },

        _setActiveFolderIdDirect: (folderId) =>
          set({ activeFolderId: folderId }),

        // URL sync only — restores open items from the URL (does not change card selection)
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
              if (deriveWorkspaceOpenMode(state.openItems) === "grid")
                return {};
              return {
                openItems: emptyOpenItems(),
                activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
                citationHighlightQuery: null,
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
            // Closing primary exits fully (same as today’s one-item overlay).
            if (primary === itemId) {
              return {
                openItems: emptyOpenItems(),
                activeWorkspaceItemSlot: "primary" as WorkspaceItemSlot,
                citationHighlightQuery: null,
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
              citationHighlightQuery: null,
            };
          });
        },

        setActiveWorkspaceItemSlot: (slot) =>
          set({ activeWorkspaceItemSlot: slot }),

        setItemPrompt: (prompt) => set({ itemPrompt: prompt }),

        setShowCreateWorkspaceModal: (show) =>
          set({ showCreateWorkspaceModal: show }),
        setShowSheetModal: (show) => set({ showSheetModal: show }),

        setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),
        setMemoryEnabled: (enabled) => set({ memoryEnabled: enabled }),

        // Card selection actions
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

        // Scroll lock actions
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

        // Reply selection actions
        addReplySelection: (selection) =>
          set((state) => {
            const newSelections = [...state.replySelections, selection];
            return { replySelections: newSelections };
          }),
        removeReplySelection: (index) =>
          set((state) => ({
            replySelections: state.replySelections.filter(
              (_, i) => i !== index,
            ),
          })),
        clearReplySelections: () => set({ replySelections: [] }),
        setCitationHighlightQuery: (query) => {
          set({ citationHighlightQuery: query });
        },
        setActivePdfPage: (itemId, page) => {
          set((state) => {
            const next = { ...state.activePdfPageByItemId };
            if (page == null) {
              delete next[itemId];
            } else {
              next[itemId] = page;
            }
            return { activePdfPageByItemId: next };
          });
        },

        // Utility actions
        resetChatState: () =>
          set({
            isChatExpanded: initialState.isChatExpanded,
            isChatMaximized: initialState.isChatMaximized,
            workspacePanelSize: initialState.workspacePanelSize,
          }),

        // Chat actions
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
        partialize: (state) => ({
          selectedModelId: state.selectedModelId,
          memoryEnabled: state.memoryEnabled,
        }),
      },
    ),
    { name: "UI Store" },
  ),
);

export const selectWorkspaceOpenMode = (state: UIState) =>
  deriveWorkspaceOpenMode(state.openItems);

/** Stable sorted array for `selectedCardIds` (avoids unnecessary re-renders). */
export const selectSelectedCardIdsArray = (state: UIState): string[] => {
  return Array.from(state.selectedCardIds).sort();
};

export const selectReplySelections = (state: UIState) => state.replySelections;

export const selectItemScrollLocked =
  (itemId: string) =>
  (state: UIState): boolean => {
    return state.itemScrollLocked.get(itemId) ?? true;
  };
