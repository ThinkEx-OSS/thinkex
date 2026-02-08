import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { WORKSPACE_PANEL_SIZES } from '@/lib/layout-constants';

/**
 * UI Store - Manages all UI state (chat, modals, search, layout, text selection)
 * This replaces scattered useState hooks in dashboard
 */

interface UIState {
  // Chat state
  isChatExpanded: boolean;
  isChatMaximized: boolean;
  isThreadListVisible: boolean;

  // Layout state
  workspacePanelSize: number; // percentage (0-100)

  // Panel state (item panels for notes/PDFs)
  openPanelIds: string[]; // Array of open item IDs (order = layout order, max 2)
  itemPrompt: { itemId: string; x: number; y: number } | null; // Global prompt state
  maximizedItemId: string | null; // The ID of the item currently expanded to full screen

  // Modal state
  showVersionHistory: boolean;
  showCreateWorkspaceModal: boolean;
  showSheetModal: boolean;
  showJsonView: boolean;
  searchQuery: string;

  activeFolderId: string | null; // Active folder for filtering
  selectedActions: string[]; // Action IDs selected in the actions menu
  selectedModelId: string; // Selected AI model ID

  // Text selection state
  inMultiSelectMode: boolean;
  inSingleSelectMode: boolean;
  tooltipVisible: boolean;
  selectedHighlightColorId: string;

  // Card selection state
  selectedCardIds: Set<string>;
  playingYouTubeCardIds: Set<string>;
  // Track which cards were auto-selected by panel opening (to preserve user selections on close)
  panelAutoSelectedCardIds: Set<string>;

  // Scroll lock state per item (itemId -> isScrollLocked)
  itemScrollLocked: Map<string, boolean>;

  // Reply selection state
  replySelections: Array<{ text: string; messageContext?: string; userPrompt?: string }>;

  // BlockNote text selection state
  blockNoteSelection: { cardId: string; cardName: string; text: string } | null;


  // Actions - Chat
  setIsChatExpanded: (expanded: boolean) => void;
  toggleChatExpanded: () => void;
  setIsChatMaximized: (maximized: boolean) => void;
  toggleChatMaximized: () => void;
  setIsThreadListVisible: (visible: boolean) => void;
  toggleThreadListVisible: () => void;
  setWorkspacePanelSize: (size: number) => void;


  // Actions - Panels
  openPanel: (itemId: string, mode: 'replace' | 'add') => void;
  closePanel: (itemId: string) => void;
  closeAllPanels: () => void;
  reorderPanels: (fromIndex: number, toIndex: number) => void;
  setItemPrompt: (prompt: { itemId: string; x: number; y: number } | null) => void;
  setMaximizedItemId: (itemId: string | null) => void;

  // Legacy compatibility - setOpenModalItemId is widely used, maps to openPanel replace mode
  setOpenModalItemId: (id: string | null) => void;
  setShowVersionHistory: (show: boolean) => void;
  setShowCreateWorkspaceModal: (show: boolean) => void;
  setShowSheetModal: (show: boolean) => void;


  // Actions - UI Preferences
  setShowJsonView: (show: boolean) => void;
  setSearchQuery: (query: string) => void;

  setActiveFolderId: (folderId: string | null) => void;
  clearActiveFolder: () => void;
  /** Direct setter used by useFolderUrl hook — does not clear panels (URL sync only) */
  _setActiveFolderIdDirect: (folderId: string | null) => void;
  /** Direct panel open used by useFolderUrl hook — URL sync only */
  _openPanelDirect: (itemId: string) => void;
  /** Direct panel close used by useFolderUrl hook — URL sync only */
  _closePanelDirect: () => void;
  setSelectedActions: (actions: string[]) => void;
  clearSelectedActions: () => void;
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
  setCardPlaying: (id: string, isPlaying: boolean) => void;
  clearPlayingYouTubeCards: () => void;

  // Actions - Scroll lock state
  setItemScrollLocked: (itemId: string, isLocked: boolean) => void;
  toggleItemScrollLocked: (itemId: string) => void;

  // Actions - Reply selection
  addReplySelection: (selection: { text: string; messageContext?: string; userPrompt?: string }) => void;
  removeReplySelection: (index: number) => void;
  clearReplySelections: () => void;

  // Actions - BlockNote selection
  setBlockNoteSelection: (selection: { cardId: string; cardName: string; text: string } | null) => void;
  clearBlockNoteSelection: () => void;

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
  workspacePanelSize: WORKSPACE_PANEL_SIZES.WITH_CHAT, // Default when chat is expanded

  // Panels
  openPanelIds: [],
  itemPrompt: null,
  maximizedItemId: null,
  showVersionHistory: false,
  showCreateWorkspaceModal: false,
  showSheetModal: false,


  // UI Preferences
  showJsonView: false,
  searchQuery: '',

  activeFolderId: null,
  selectedActions: [],
  selectedModelId: 'gemini-2.5-flash',

  // Text selection
  inMultiSelectMode: false,
  inSingleSelectMode: false,
  tooltipVisible: false,
  selectedHighlightColorId: 'blue',

  // Card selection
  selectedCardIds: new Set<string>(),
  playingYouTubeCardIds: new Set<string>(),
  panelAutoSelectedCardIds: new Set<string>(),

  // Scroll lock state
  itemScrollLocked: new Map<string, boolean>(),

  // Reply selection
  replySelections: [],

  // BlockNote selection
  blockNoteSelection: null,
};

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      ...initialState,

      // Folder navigation — preserve manual user selections
      setActiveFolderId: (folderId) => {
        set((state) => {
          if (state.activeFolderId === folderId && state.openPanelIds.length === 0) {
            return {};
          }
          // Remove only auto-selected cards, preserve manual selections
          const newSelectedCardIds = new Set(state.selectedCardIds);
          state.panelAutoSelectedCardIds.forEach(id => newSelectedCardIds.delete(id));
          return {
            activeFolderId: folderId,
            openPanelIds: [],
            maximizedItemId: null,
            selectedCardIds: newSelectedCardIds,
            panelAutoSelectedCardIds: new Set(),
          };
        });
      },

      clearActiveFolder: () => {
        set((state) => {
          if (state.activeFolderId === null && state.openPanelIds.length === 0) return {};
          // Remove only auto-selected cards, preserve manual selections
          const newSelectedCardIds = new Set(state.selectedCardIds);
          state.panelAutoSelectedCardIds.forEach(id => newSelectedCardIds.delete(id));
          return {
            activeFolderId: null,
            openPanelIds: [],
            maximizedItemId: null,
            selectedCardIds: newSelectedCardIds,
            panelAutoSelectedCardIds: new Set(),
          };
        });
      },

      // Direct setter used by useFolderUrl hook for URL → store sync
      // Does NOT clear panels — only updates the folder ID
      _setActiveFolderIdDirect: (folderId) => set({ activeFolderId: folderId }),

      // Direct panel open/close used by useFolderUrl hook for URL → store sync
      _openPanelDirect: (itemId) => set({ openPanelIds: [itemId], maximizedItemId: itemId }),
      _closePanelDirect: () => set((state) => {
        // Remove only auto-selected cards, preserve manual selections
        const newSelectedCardIds = new Set(state.selectedCardIds);
        state.panelAutoSelectedCardIds.forEach(id => newSelectedCardIds.delete(id));
        return {
          openPanelIds: [],
          maximizedItemId: null,
          selectedCardIds: newSelectedCardIds,
          panelAutoSelectedCardIds: new Set(),
        };
      }),

      // Panel actions
      openPanel: (itemId, mode) => {
        set((state) => {
          const isAlreadyOpen = state.openPanelIds.length === 1 && state.openPanelIds[0] === itemId;
          if (isAlreadyOpen) return {};

          const newSelectedCardIds = new Set(state.selectedCardIds);
          const newPanelAutoSelectedCardIds = new Set(state.panelAutoSelectedCardIds);
          
          // Add to selections and track as auto-selected
          newSelectedCardIds.add(itemId);
          newPanelAutoSelectedCardIds.add(itemId);

          return {
            openPanelIds: [itemId],
            maximizedItemId: itemId,
            selectedCardIds: newSelectedCardIds,
            panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
          };
        });
      },

      closePanel: (itemId) => {
        set((state) => {
          if (state.openPanelIds.length === 0) return {};
          // Remove only auto-selected cards, preserve manual selections
          const newSelectedCardIds = new Set(state.selectedCardIds);
          state.panelAutoSelectedCardIds.forEach(id => newSelectedCardIds.delete(id));
          return {
            openPanelIds: [],
            maximizedItemId: null,
            selectedCardIds: newSelectedCardIds,
            panelAutoSelectedCardIds: new Set(),
          };
        });
      },

      closeAllPanels: () => {
        set((state) => {
          if (state.openPanelIds.length === 0) return {};
          // Remove only auto-selected cards, preserve manual selections
          const newSelectedCardIds = new Set(state.selectedCardIds);
          state.panelAutoSelectedCardIds.forEach(id => newSelectedCardIds.delete(id));
          return {
            openPanelIds: [],
            maximizedItemId: null,
            selectedCardIds: newSelectedCardIds,
            panelAutoSelectedCardIds: new Set(),
          };
        });
      },

      reorderPanels: (fromIndex, toIndex) => set((state) => {
        // No reordering in single view
        return state;
      }),

      setItemPrompt: (prompt) => set({ itemPrompt: prompt }),
      setMaximizedItemId: (id) => set({ maximizedItemId: id }),

      // Legacy compatibility
      setOpenModalItemId: (id) => {
        set((state) => {
          if (id === null) {
            if (state.openPanelIds.length === 0) return {};
            return {
              openPanelIds: [],
              maximizedItemId: null,
              panelAutoSelectedCardIds: new Set(),
            };
          } else {
            const isAlreadyOpen = state.openPanelIds.length === 1 && state.openPanelIds[0] === id;
            if (isAlreadyOpen) return {};

            const newSelectedCardIds = new Set(state.selectedCardIds);
            const newPanelAutoSelectedCardIds = new Set(state.panelAutoSelectedCardIds);
            
            // Add to selections and track as auto-selected
            newSelectedCardIds.add(id);
            newPanelAutoSelectedCardIds.add(id);

            return {
              openPanelIds: [id],
              maximizedItemId: id,
              selectedCardIds: newSelectedCardIds,
              panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
            };
          }
        });
      },

      setShowVersionHistory: (show) => set({ showVersionHistory: show }),
      setShowCreateWorkspaceModal: (show) => set({ showCreateWorkspaceModal: show }),
      setShowSheetModal: (show) => set({ showSheetModal: show }),

      // UI Preferences actions
      setShowJsonView: (show) => set({ showJsonView: show }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      setSelectedActions: (actions) => set({ selectedActions: actions }),
      clearSelectedActions: () => set({ selectedActions: [] }),
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

      setCardPlaying: (id, isPlaying) => set((state) => {
        const newSet = new Set(state.playingYouTubeCardIds);
        if (isPlaying) {
          newSet.add(id);
        } else {
          newSet.delete(id);
        }
        return { playingYouTubeCardIds: newSet };
      }),
      clearPlayingYouTubeCards: () => set({ playingYouTubeCardIds: new Set<string>() }),

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

      // BlockNote selection actions
      setBlockNoteSelection: (selection) => {
        set({ blockNoteSelection: selection });
      },
      clearBlockNoteSelection: () => {
        set({ blockNoteSelection: null });
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
          openPanelIds: [],
          itemPrompt: null,
          maximizedItemId: null,
          showVersionHistory: false,
          showCreateWorkspaceModal: false,
          showSheetModal: false,
          selectedCardIds: newSelectedCardIds,
          panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
        };
      }),
    }),
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
  showVersionHistory: state.showVersionHistory,
  showCreateWorkspaceModal: state.showCreateWorkspaceModal,
  showSheetModal: state.showSheetModal,
});

// Panel selectors - for backwards compatibility and convenience
export const selectOpenPanelIds = (state: UIState) => state.openPanelIds;
export const selectPrimaryPanelId = (state: UIState) => state.openPanelIds[0] ?? null;
export const selectSecondaryPanelId = (state: UIState) => state.openPanelIds[1] ?? null;
export const selectHasSplitView = (state: UIState) => state.openPanelIds.length >= 2;
export const selectIsPanelOpen = (state: UIState) => state.openPanelIds.length > 0;

// Legacy compatibility selectors
export const selectOpenModalItemId = (state: UIState) => state.openPanelIds[0] ?? null;
export const selectSecondaryOpenModalItemId = (state: UIState) => state.openPanelIds[1] ?? null;

export const selectUIPreferences = (state: UIState) => ({
  showJsonView: state.showJsonView,
  searchQuery: state.searchQuery,
});

export const selectTextSelectionState = (state: UIState) => ({
  inMultiSelectMode: state.inMultiSelectMode,
  tooltipVisible: state.tooltipVisible,
  selectedHighlightColorId: state.selectedHighlightColorId,
});

export const selectCardSelectionState = (state: UIState) => ({
  selectedCardIds: state.selectedCardIds,
  playingYouTubeCardIds: state.playingYouTubeCardIds,
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

// Selector for BlockNote selection
export const selectBlockNoteSelection = (state: UIState) => state.blockNoteSelection;

// Selector for item scroll lock state
export const selectItemScrollLocked = (itemId: string) => (state: UIState): boolean => {
  return state.itemScrollLocked.get(itemId) ?? true; // Default to locked (true)
};

