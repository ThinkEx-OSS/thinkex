import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';

/**
 * UI Store - Manages all UI state (chat, modals, search, layout, text selection)
 * This replaces scattered useState hooks in dashboard
 */

export type ViewMode = 'workspace' | 'focus';

interface UIState {
  // Chat state
  isChatExpanded: boolean;
  isChatMaximized: boolean;
  isThreadListVisible: boolean;

  // View mode & Panel state
  viewMode: ViewMode; // Current layout mode
  openPanelIds: string[]; // Array containing the currently focused item ID when one is open
  itemPrompt: { itemId: string; x: number; y: number } | null; // Global prompt state
  maximizedItemId: string | null; // The ID of the item currently expanded to full screen (focus mode)


  // Modal state
  showCreateWorkspaceModal: boolean;
  showSheetModal: boolean;
  showJsonView: boolean;

  activeFolderId: string | null; // Active folder for filtering
  selectedModelId: string; // Selected AI model ID

  // Text selection state
  inMultiSelectMode: boolean;
  inSingleSelectMode: boolean;
  tooltipVisible: boolean;
  selectedHighlightColorId: string;

  // Card selection state
  selectedCardIds: Set<string>;
  // Track which cards were auto-selected by panel opening (to preserve user selections on close)
  panelAutoSelectedCardIds: Set<string>;

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

  // Actions - Panels & View Mode
  closePanel: (itemId: string) => void;
  closeAllPanels: () => void;
  setItemPrompt: (prompt: { itemId: string; x: number; y: number } | null) => void;
  setMaximizedItemId: (itemId: string | null) => void;


  // Legacy compatibility - setOpenModalItemId is widely used, maps to openPanel replace mode
  setOpenModalItemId: (id: string | null) => void;
  setShowCreateWorkspaceModal: (show: boolean) => void;
  setShowSheetModal: (show: boolean) => void;


  // Actions - UI Preferences
  setShowJsonView: (show: boolean) => void;

  setActiveFolderId: (folderId: string | null) => void;
  /** Atomic: close panels, clear folder, deselect panel cards. Use when panel is focused and user navigates back. */
  navigateToRoot: () => void;
  /** Atomic: close panels, set folder, deselect panel cards. Use when panel is focused and user navigates back. */
  navigateToFolder: (folderId: string) => void;
  /** URL sync only — sets folder without touching panels */
  _setActiveFolderIdDirect: (folderId: string | null) => void;
  /** URL sync only — sets panels and optionally focused (maximized) item */
  _setPanelsFromUrl: (ids: string[], maximizedId?: string | null) => void;
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

const initialState = {
  // Chat
  isChatExpanded: true,
  isChatMaximized: false,
  isThreadListVisible: false,

  // View mode & Panels
  viewMode: 'workspace' as ViewMode,
  openPanelIds: [],
  itemPrompt: null,
  maximizedItemId: null,

  showCreateWorkspaceModal: false,
  showSheetModal: false,


  // UI Preferences
  showJsonView: false,

  activeFolderId: null,
  selectedModelId: 'gemini-3-flash-preview',

  // Text selection
  inMultiSelectMode: false,
  inSingleSelectMode: false,
  tooltipVisible: false,
  selectedHighlightColorId: 'blue',

  // Card selection
  selectedCardIds: new Set<string>(),
  panelAutoSelectedCardIds: new Set<string>(),

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

        // Atomic navigation — close panels, set folder, deselect panel cards.
        navigateToRoot: () => {
          set((state) => {
            if (state.activeFolderId === null && state.openPanelIds.length === 0) return {};
            const newSelectedCardIds = new Set(state.selectedCardIds);
            state.panelAutoSelectedCardIds.forEach(id => newSelectedCardIds.delete(id));
            return {
              activeFolderId: null,
              viewMode: 'workspace' as ViewMode,
              openPanelIds: [],
              maximizedItemId: null,
              selectedCardIds: newSelectedCardIds,
              panelAutoSelectedCardIds: new Set(),
            };
          });
        },

        navigateToFolder: (folderId) => {
          set((state) => {
            if (state.activeFolderId === folderId && state.openPanelIds.length === 0) return {};
            const newSelectedCardIds = new Set(state.selectedCardIds);
            state.panelAutoSelectedCardIds.forEach(id => newSelectedCardIds.delete(id));
            return {
              activeFolderId: folderId,
              viewMode: 'workspace' as ViewMode,
              openPanelIds: [],
              maximizedItemId: null,
              selectedCardIds: newSelectedCardIds,
              panelAutoSelectedCardIds: new Set(),
            };
          });
        },

        _setActiveFolderIdDirect: (folderId) => set({ activeFolderId: folderId }),

        // URL sync only — restores the focused item from the URL
        _setPanelsFromUrl: (ids, maximizedId) => set((state) => {
          const validIds = ids.slice(0, 1);
          if (validIds.length === 0) {
            const newSelectedCardIds = new Set(state.selectedCardIds);
            state.panelAutoSelectedCardIds.forEach(id => newSelectedCardIds.delete(id));
            return {
              viewMode: 'workspace' as ViewMode,
              openPanelIds: [],
              maximizedItemId: null,
              selectedCardIds: newSelectedCardIds,
              panelAutoSelectedCardIds: new Set(),
            };
          }
          const newSelectedCardIds = new Set(state.selectedCardIds);
          const newPanelAutoSelectedCardIds = new Set<string>();
          validIds.forEach(id => {
            newSelectedCardIds.add(id);
            // Don't overwrite: if user had explicitly selected (in selectedCardIds but not panelAuto),
            // preserve that so it stays selected on close
            const wasExplicitlySelected = state.selectedCardIds.has(id) && !state.panelAutoSelectedCardIds.has(id);
            if (!wasExplicitlySelected) newPanelAutoSelectedCardIds.add(id);
          });
          state.panelAutoSelectedCardIds.forEach(id => {
            if (!validIds.includes(id)) newSelectedCardIds.delete(id);
          });
          const focusId =
            maximizedId && validIds[0] === maximizedId
              ? maximizedId
              : validIds[0] ?? null;
          return {
            openPanelIds: focusId ? [focusId] : [],
            maximizedItemId: focusId,
            viewMode: focusId ? 'focus' as ViewMode : 'workspace' as ViewMode,
            selectedCardIds: newSelectedCardIds,
            panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
          };
        }),

        closePanel: (itemId) => {
          set((state) => {
            if (state.openPanelIds.length === 0) return {};

            const remaining = state.openPanelIds.filter(id => id !== itemId);
            const newSelectedCardIds = new Set(state.selectedCardIds);
            const wasInPanelAuto = state.panelAutoSelectedCardIds.has(itemId);

            // Remove the closed item from auto-selected if it was auto-selected
            if (wasInPanelAuto) {
              newSelectedCardIds.delete(itemId);
            }
            const newPanelAutoSelectedCardIds = new Set(state.panelAutoSelectedCardIds);
            newPanelAutoSelectedCardIds.delete(itemId);

            return {
              viewMode: 'workspace' as ViewMode,
              openPanelIds: remaining,
              maximizedItemId: null,
              selectedCardIds: newSelectedCardIds,
              panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
              citationHighlightQuery: null,
            };
          });
        },

        closeAllPanels: () => {
          set((state) => {
            if (state.openPanelIds.length === 0 && state.viewMode === 'workspace') return {};
            // Remove only auto-selected cards, preserve manual selections
            const newSelectedCardIds = new Set(state.selectedCardIds);
            state.panelAutoSelectedCardIds.forEach(id => newSelectedCardIds.delete(id));
            return {
              viewMode: 'workspace' as ViewMode,
              openPanelIds: [],
              maximizedItemId: null,
              selectedCardIds: newSelectedCardIds,
              panelAutoSelectedCardIds: new Set(),
              citationHighlightQuery: null,
            };
          });
        },

        setItemPrompt: (prompt) => set({ itemPrompt: prompt }),
        setMaximizedItemId: (id) => set({
          maximizedItemId: id,
          viewMode: id ? 'focus' as ViewMode : 'workspace' as ViewMode,
          // When entering focus mode, keep openPanelIds for breadcrumb; when leaving, clear
          ...(id === null ? { openPanelIds: [] } : { openPanelIds: [id] }),
        }),

        // Legacy compatibility — opens item in focus mode (maximized)
        setOpenModalItemId: (id) => {
          set((state) => {
            if (id === null) {
              if (state.openPanelIds.length === 0 && state.viewMode === 'workspace') return {};
              // Remove only auto-selected cards
              const newSelectedCardIds = new Set(state.selectedCardIds);
              state.panelAutoSelectedCardIds.forEach(aid => newSelectedCardIds.delete(aid));
              return {
                viewMode: 'workspace' as ViewMode,
                openPanelIds: [],
                maximizedItemId: null,
                selectedCardIds: newSelectedCardIds,
                panelAutoSelectedCardIds: new Set(),
                citationHighlightQuery: null,
              };
            } else {
              const isAlreadyOpen = state.openPanelIds.length === 1 && state.openPanelIds[0] === id && state.maximizedItemId === id;
              if (isAlreadyOpen) return {};

              const newSelectedCardIds = new Set(state.selectedCardIds);
              const newPanelAutoSelectedCardIds = new Set(state.panelAutoSelectedCardIds);

              // Clean up old auto-selected cards
              state.panelAutoSelectedCardIds.forEach(aid => newSelectedCardIds.delete(aid));
              newPanelAutoSelectedCardIds.clear();

              newSelectedCardIds.add(id);
              const wasExplicitlySelected = state.selectedCardIds.has(id) && !state.panelAutoSelectedCardIds.has(id);
              if (!wasExplicitlySelected) newPanelAutoSelectedCardIds.add(id);

              return {
                viewMode: 'focus' as ViewMode,
                openPanelIds: [id],
                maximizedItemId: id,
                selectedCardIds: newSelectedCardIds,
                panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
              };
            }
          });
        },

        setShowCreateWorkspaceModal: (show) => set({ showCreateWorkspaceModal: show }),
        setShowSheetModal: (show) => set({ showSheetModal: show }),

        // UI Preferences actions
        setShowJsonView: (show) => set({ showJsonView: show }),

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
          const newPanelAutoSelectedCardIds = new Set(state.panelAutoSelectedCardIds);

          if (newSet.has(id)) {
            newSet.delete(id);
            newPanelAutoSelectedCardIds.delete(id);
          } else {
            newSet.add(id);
          }
          return {
            selectedCardIds: newSet,
            panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
          };
        }),

        clearCardSelection: () => set({
          selectedCardIds: new Set<string>(),
          panelAutoSelectedCardIds: new Set<string>(),
        }),

        selectMultipleCards: (ids) => set((state) => {
          const newSelectedCardIds = new Set(ids);
          const newPanelAutoSelectedCardIds = new Set(state.panelAutoSelectedCardIds);

          newPanelAutoSelectedCardIds.forEach(id => {
            if (!newSelectedCardIds.has(id)) {
              newPanelAutoSelectedCardIds.delete(id);
            }
          });

          newSelectedCardIds.forEach(id => {
            newPanelAutoSelectedCardIds.delete(id);
          });

          return {
            selectedCardIds: newSelectedCardIds,
            panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
          };
        }),

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
        }),

        // Chat actions
        setIsChatExpanded: (expanded) => set({ isChatExpanded: expanded }),
        toggleChatExpanded: () => set((state) => ({ isChatExpanded: !state.isChatExpanded })),
        setIsChatMaximized: (maximized) => set({ isChatMaximized: maximized }),
        toggleChatMaximized: () => set((state) => ({ isChatMaximized: !state.isChatMaximized })),
        setIsThreadListVisible: (visible) => set({ isThreadListVisible: visible }),
        toggleThreadListVisible: () => set((state) => ({ isThreadListVisible: !state.isThreadListVisible })),

        closeAllModals: () => set((state) => {
          // Only remove auto-selected cards from selection
          const newSelectedCardIds = new Set(state.selectedCardIds);
          const newPanelAutoSelectedCardIds = new Set(state.panelAutoSelectedCardIds);

          state.openPanelIds.forEach(id => {
            if (newPanelAutoSelectedCardIds.has(id)) {
              newSelectedCardIds.delete(id);
              newPanelAutoSelectedCardIds.delete(id);
            }
          });

          return {
            viewMode: 'workspace' as ViewMode,
            openPanelIds: [],
            itemPrompt: null,
            maximizedItemId: null,
            showCreateWorkspaceModal: false,
            showSheetModal: false,
            selectedCardIds: newSelectedCardIds,
            panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
          };
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
  openPanelIds: state.openPanelIds,
  itemPrompt: state.itemPrompt,
  showCreateWorkspaceModal: state.showCreateWorkspaceModal,
  showSheetModal: state.showSheetModal,
});

// View mode selector
export const selectViewMode = (state: UIState) => state.viewMode;

// Panel selectors - for backwards compatibility and convenience
export const selectOpenPanelIds = (state: UIState) => state.openPanelIds;
export const selectPrimaryPanelId = (state: UIState) => state.openPanelIds[0] ?? null;
export const selectSecondaryPanelId = () => null;

export const selectIsPanelOpen = (state: UIState) => state.openPanelIds.length > 0;

// Legacy compatibility selectors
export const selectOpenModalItemId = (state: UIState) => state.openPanelIds[0] ?? null;
export const selectSecondaryOpenModalItemId = () => null;

export const selectUIPreferences = (state: UIState) => ({
  showJsonView: state.showJsonView,
});

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

