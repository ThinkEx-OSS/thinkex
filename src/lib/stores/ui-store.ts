import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { WORKSPACE_PANEL_SIZES } from '@/lib/layout-constants';

/**
 * UI Store - Manages all UI state (chat, modals, search, layout, text selection)
 * This replaces scattered useState hooks in dashboard
 */

/** Folder grid vs one open item vs (future) split columns */
export type WorkspaceLayout = 'grid' | 'single';

/** Spatial pane columns — not primary/secondary */
export type WorkspacePaneSide = 'left' | 'right';

export interface ItemPanes {
  left: string | null;
  right: string | null;
}

/*
 * Future split (same field names):
 * - workspaceLayout: add 'split'
 * - itemPanes.right may be set alongside .left
 * - setActivePane('left' | 'right') for focus / a11y
 * - Optional URL: items=leftId,rightId with documented column order
 */

interface UIState {
  // Chat state
  isChatExpanded: boolean;
  isChatMaximized: boolean;
  isThreadListVisible: boolean;

  // Layout state
  workspacePanelSize: number; // percentage (0-100)

  /** grid = folder view; single = one item open in the left pane (overlay) */
  workspaceLayout: WorkspaceLayout;
  itemPanes: ItemPanes;
  /** Focused pane for keyboard/a11y; v1 stays 'left' */
  activePaneId: WorkspacePaneSide;

  itemPrompt: { itemId: string; x: number; y: number } | null; // Global prompt state

  // Modal state
  showCreateWorkspaceModal: boolean;
  showSheetModal: boolean;

  activeFolderId: string | null; // Active folder for filtering
  selectedModelId: string; // Selected AI model ID

  // Text selection state
  inMultiSelectMode: boolean;
  inSingleSelectMode: boolean;
  tooltipVisible: boolean;
  selectedHighlightColorId: string;

  // Card selection state (user actions only — opening a panel does not change selection)
  selectedCardIds: Set<string>;

  // Scroll lock state per item (itemId -> isScrollLocked)
  itemScrollLocked: Map<string, boolean>;

  // Reply selection state
  replySelections: Array<{ text: string; messageContext?: string; userPrompt?: string; title?: string }>;

  // Citation highlight: when opening document/PDF from citation click, highlight/search this quote
  citationHighlightQuery: { itemId: string; query: string; pageNumber?: number } | null;

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

  // Actions - Workspace item panes
  /** Open item in the left pane, or null to close and return to grid */
  openItemInLeft: (itemId: string | null) => void;
  closeWorkspaceItem: (itemId: string) => void;
  closeAllWorkspaceItems: () => void;
  setActivePane: (side: WorkspacePaneSide) => void;
  setItemPrompt: (prompt: { itemId: string; x: number; y: number } | null) => void;

  setShowCreateWorkspaceModal: (show: boolean) => void;
  setShowSheetModal: (show: boolean) => void;

  setActiveFolderId: (folderId: string | null) => void;
  /** Atomic: close panels and clear folder. Use when panel is focused and user navigates back. */
  navigateToRoot: () => void;
  /** Atomic: close panels and set folder. Use when panel is focused and user navigates back. */
  navigateToFolder: (folderId: string) => void;
  /** URL sync only — sets folder without touching panels */
  _setActiveFolderIdDirect: (folderId: string | null) => void;
  /** URL sync only — restores left pane from `items` query (first id only) */
  _setItemPanesFromUrl: (ids: string[]) => void;
  setSelectedModelId: (modelId: string) => void;

  // Actions - Text selection
  setInMultiSelectMode: (inMultiMode: boolean) => void;
  setInSingleSelectMode: (inSingleMode: boolean) => void;
  setTooltipVisible: (visible: boolean) => void;
  setSelectedHighlightColorId: (colorId: string) => void;
  enterMultiSelectMode: () => void;
  exitMultiSelectMode: () => void;
  enterSingleSelectMode: () => void;
  exitSingleSelectMode: () => void;

  // Actions - Card selection
  toggleCardSelection: (id: string) => void;
  clearCardSelection: () => void;
  selectMultipleCards: (ids: string[]) => void;

  // Actions - Scroll lock state
  setItemScrollLocked: (itemId: string, isLocked: boolean) => void;
  toggleItemScrollLocked: (itemId: string) => void;

  // Actions - Reply selection
  addReplySelection: (selection: { text: string; messageContext?: string; userPrompt?: string; title?: string }) => void;
  removeReplySelection: (index: number) => void;
  clearReplySelections: () => void;
  setCitationHighlightQuery: (query: { itemId: string; query: string; pageNumber?: number } | null) => void;
  setActivePdfPage: (itemId: string, page: number | null) => void;

  // Utility actions
  resetChatState: () => void;
  closeAllModals: () => void;
}

const emptyPanes = (): ItemPanes => ({ left: null, right: null });

const initialState = {
  // Chat
  isChatExpanded: true,
  isChatMaximized: false,
  isThreadListVisible: false,

  // Layout
  workspacePanelSize: WORKSPACE_PANEL_SIZES.WITH_CHAT, // Default when chat is expanded

  workspaceLayout: 'grid' as WorkspaceLayout,
  itemPanes: emptyPanes(),
  activePaneId: 'left' as WorkspacePaneSide,

  itemPrompt: null,

  showCreateWorkspaceModal: false,
  showSheetModal: false,

  activeFolderId: null,
  selectedModelId: 'gemini-3-flash-preview',

  // Text selection
  inMultiSelectMode: false,
  inSingleSelectMode: false,
  tooltipVisible: false,
  selectedHighlightColorId: 'blue',

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
            if (state.activeFolderId === null && !state.itemPanes.left) return {};
            return {
              activeFolderId: null,
              workspaceLayout: 'grid' as WorkspaceLayout,
              itemPanes: emptyPanes(),
              activePaneId: 'left' as WorkspacePaneSide,
            };
          });
        },

        navigateToFolder: (folderId) => {
          set((state) => {
            if (state.activeFolderId === folderId && !state.itemPanes.left) return {};
            return {
              activeFolderId: folderId,
              workspaceLayout: 'grid' as WorkspaceLayout,
              itemPanes: emptyPanes(),
              activePaneId: 'left' as WorkspacePaneSide,
            };
          });
        },

        _setActiveFolderIdDirect: (folderId) => set({ activeFolderId: folderId }),

        // URL sync only — restores open panel from the URL (does not change card selection)
        _setItemPanesFromUrl: (ids) => set(() => {
          const validIds = ids.slice(0, 1);
          if (validIds.length === 0) {
            return {
              workspaceLayout: 'grid' as WorkspaceLayout,
              itemPanes: emptyPanes(),
              activePaneId: 'left' as WorkspacePaneSide,
            };
          }
          const leftId = validIds[0] ?? null;
          return {
            itemPanes: { left: leftId, right: null },
            workspaceLayout: (leftId ? 'single' : 'grid') as WorkspaceLayout,
            activePaneId: 'left' as WorkspacePaneSide,
          };
        }),

        openItemInLeft: (id) => {
          set((state) => {
            if (id === null) {
              if (!state.itemPanes.left && state.workspaceLayout === 'grid') return {};
              return {
                workspaceLayout: 'grid' as WorkspaceLayout,
                itemPanes: emptyPanes(),
                activePaneId: 'left' as WorkspacePaneSide,
                citationHighlightQuery: null,
              };
            }
            if (
              state.itemPanes.left === id &&
              state.workspaceLayout === 'single' &&
              !state.itemPanes.right
            ) {
              return {};
            }
            return {
              workspaceLayout: 'single' as WorkspaceLayout,
              itemPanes: { left: id, right: null },
              activePaneId: 'left' as WorkspacePaneSide,
            };
          });
        },

        closeWorkspaceItem: (itemId) => {
          set((state) => {
            if (state.itemPanes.left !== itemId && state.itemPanes.right !== itemId) {
              return {};
            }
            return {
              workspaceLayout: 'grid' as WorkspaceLayout,
              itemPanes: emptyPanes(),
              activePaneId: 'left' as WorkspacePaneSide,
              citationHighlightQuery: null,
            };
          });
        },

        closeAllWorkspaceItems: () => {
          set((state) => {
            if (!state.itemPanes.left && !state.itemPanes.right && state.workspaceLayout === 'grid') {
              return {};
            }
            return {
              workspaceLayout: 'grid' as WorkspaceLayout,
              itemPanes: emptyPanes(),
              activePaneId: 'left' as WorkspacePaneSide,
              citationHighlightQuery: null,
            };
          });
        },

        setActivePane: (side) => set({ activePaneId: side }),

        setItemPrompt: (prompt) => set({ itemPrompt: prompt }),

        setShowCreateWorkspaceModal: (show) => set({ showCreateWorkspaceModal: show }),
        setShowSheetModal: (show) => set({ showSheetModal: show }),

        setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),

        // Text selection actions
        setInMultiSelectMode: (inMultiMode) => set({ inMultiSelectMode: inMultiMode }),
        setInSingleSelectMode: (inSingleMode) => set({ inSingleSelectMode: inSingleMode }),
        setTooltipVisible: (visible) => set({ tooltipVisible: visible }),
        setSelectedHighlightColorId: (colorId) => set({ selectedHighlightColorId: colorId }),
        enterMultiSelectMode: () => set({ inMultiSelectMode: true, inSingleSelectMode: false, tooltipVisible: true }),
        exitMultiSelectMode: () => set({ inMultiSelectMode: false, tooltipVisible: false }),
        enterSingleSelectMode: () => set({ inSingleSelectMode: true, inMultiSelectMode: false, tooltipVisible: true }),
        exitSingleSelectMode: () => set({ inSingleSelectMode: false, tooltipVisible: false }),

        // Card selection actions
        toggleCardSelection: (id) => set((state) => {
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
        setItemScrollLocked: (itemId, isLocked) => set((state) => {
          const newMap = new Map(state.itemScrollLocked);
          newMap.set(itemId, isLocked);
          return { itemScrollLocked: newMap };
        }),
        toggleItemScrollLocked: (itemId) => set((state) => {
          const newMap = new Map(state.itemScrollLocked);
          const current = newMap.get(itemId) ?? true;
          newMap.set(itemId, !current);
          return { itemScrollLocked: newMap };
        }),

        // Reply selection actions
        addReplySelection: (selection) => set((state) => {
          const newSelections = [...state.replySelections, selection];
          return { replySelections: newSelections };
        }),
        removeReplySelection: (index) => set((state) => ({
          replySelections: state.replySelections.filter((_, i) => i !== index),
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
        resetChatState: () => set({
          isChatExpanded: initialState.isChatExpanded,
          isChatMaximized: initialState.isChatMaximized,
          workspacePanelSize: initialState.workspacePanelSize,
        }),

        // Chat actions
        setIsChatExpanded: (expanded) => set({ isChatExpanded: expanded }),
        toggleChatExpanded: () => set((state) => ({ isChatExpanded: !state.isChatExpanded })),
        setIsChatMaximized: (maximized) => set({ isChatMaximized: maximized }),
        toggleChatMaximized: () => set((state) => ({ isChatMaximized: !state.isChatMaximized })),
        setIsThreadListVisible: (visible) => set({ isThreadListVisible: visible }),
        toggleThreadListVisible: () => set((state) => ({ isThreadListVisible: !state.isThreadListVisible })),
        setWorkspacePanelSize: (size) => set({ workspacePanelSize: size }),

        closeAllModals: () =>
          set({
            workspaceLayout: 'grid' as WorkspaceLayout,
            itemPanes: emptyPanes(),
            activePaneId: 'left' as WorkspacePaneSide,
            itemPrompt: null,
            showCreateWorkspaceModal: false,
            showSheetModal: false,
          }),
      }),
      {
        name: 'thinkex-ui-preferences-v3',
        storage: createJSONStorage(() => localStorage),
        partialize: (state) => ({ selectedModelId: state.selectedModelId }),
      },
    ),
    { name: 'UI Store' }
  )
);

// Selectors for better performance - components only re-render when their slice changes
export const selectChatState = (state: UIState) => ({
  isChatExpanded: state.isChatExpanded,
  isChatMaximized: state.isChatMaximized,
});

export const selectModalState = (state: UIState) => ({
  leftPaneItemId: state.itemPanes.left,
  itemPrompt: state.itemPrompt,
  showCreateWorkspaceModal: state.showCreateWorkspaceModal,
  showSheetModal: state.showSheetModal,
});

export const selectWorkspaceLayout = (state: UIState) => state.workspaceLayout;
export const selectItemPanes = (state: UIState) => state.itemPanes;
export const selectLeftPaneItemId = (state: UIState) => state.itemPanes.left;
export const selectActivePaneId = (state: UIState) => state.activePaneId;

/** All item ids currently open in any pane (v1: 0 or 1) */
export const selectOpenWorkspaceItemIds = (state: UIState): string[] => {
  const { left, right } = state.itemPanes;
  return [left, right].filter((id): id is string => id != null);
};

export const selectIsWorkspaceItemOpen = (state: UIState) =>
  state.itemPanes.left != null || state.itemPanes.right != null;

export const selectTextSelectionState = (state: UIState) => ({
  inMultiSelectMode: state.inMultiSelectMode,
  tooltipVisible: state.tooltipVisible,
  selectedHighlightColorId: state.selectedHighlightColorId,
});

export const selectCardSelectionState = (state: UIState) => ({
  selectedCardIds: state.selectedCardIds,
});

// Helper selector that converts Set to sorted array for stable comparison
// This prevents unnecessary re-renders when Set contents haven't changed
export const selectSelectedCardIdsArray = (state: UIState): string[] => {
  return Array.from(state.selectedCardIds).sort();
};

// Helper selector to check if a specific card is selected
export const selectIsCardSelected = (cardId: string) => (state: UIState): boolean => {
  return state.selectedCardIds.has(cardId);
};

// Selector for reply selections
export const selectReplySelections = (state: UIState) => state.replySelections;

// Selector for selected highlight color
export const selectSelectedHighlightColorId = (state: UIState) => state.selectedHighlightColorId;

// Selector for item scroll lock state
export const selectItemScrollLocked = (itemId: string) => (state: UIState): boolean => {
  return state.itemScrollLocked.get(itemId) ?? true; // Default to locked (true)
};
