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

  // Folder navigation history (like browser back/forward)
  folderHistoryBack: (string | null)[]; // Stack of folder IDs we can navigate back to
  folderHistoryForward: string | null; // Only the last folder we navigated away from (not a stack)

  // Text selection state
  inMultiSelectMode: boolean;
  inSingleSelectMode: boolean;
  tooltipVisible: boolean;
  selectedHighlightColorId: string;

  // Card selection state
  selectedCardIds: Set<string>;
  playingYouTubeCardIds: Set<string>;

  // Reply selection state
  replySelections: Array<{ text: string; messageContext?: string; userPrompt?: string }>;

  // BlockNote text selection state
  blockNoteSelection: { cardId: string; cardName: string; text: string } | null;

  // Coordination callbacks (internal)
  _onBeforeThreadListToggle?: (willBeVisible: boolean) => void;

  // Actions - Chat
  setIsChatExpanded: (expanded: boolean) => void;
  toggleChatExpanded: () => void;
  setIsChatMaximized: (maximized: boolean) => void;
  toggleChatMaximized: () => void;
  setIsThreadListVisible: (visible: boolean) => void;
  toggleThreadListVisible: () => void;
  setWorkspacePanelSize: (size: number) => void;

  // Coordination actions
  setThreadListToggleCoordinator: (callback: (willBeVisible: boolean) => void) => void;

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
  navigateFolderBack: () => void;
  navigateFolderForward: () => void;
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
  selectedModelId: 'gemini-2.5-pro',
  folderHistoryBack: [],
  folderHistoryForward: null,

  // Text selection
  inMultiSelectMode: false,
  inSingleSelectMode: false,
  tooltipVisible: false,
  selectedHighlightColorId: 'blue',

  // Card selection
  selectedCardIds: new Set<string>(),
  playingYouTubeCardIds: new Set<string>(),

  // Reply selection
  replySelections: [],

  // BlockNote selection
  blockNoteSelection: null,
};

export const useUIStore = create<UIState>()(
  devtools(
    (set) => ({
      ...initialState,

      // Chat actions
      setIsChatExpanded: (expanded) => set((state) => {
        // When collapsing chat while maximized, also minimize it
        if (!expanded && state.isChatMaximized) {
          return { isChatExpanded: false, isChatMaximized: false };
        }
        return { isChatExpanded: expanded };
      }),
      toggleChatExpanded: () => set((state) => {
        // If maximized, minimize instead of collapsing
        if (state.isChatMaximized) {
          return { isChatMaximized: false };
        }
        // Toggle expanded state
        const expanded = !state.isChatExpanded;
        return { isChatExpanded: expanded };
      }),
      setIsChatMaximized: (maximized) => set((state) => {
        // When maximizing, ensure chat is expanded
        if (maximized && !state.isChatExpanded) {
          return { isChatMaximized: true, isChatExpanded: true };
        }
        return { isChatMaximized: maximized };
      }),
      toggleChatMaximized: () => set((state) => {
        const maximized = !state.isChatMaximized;
        // When maximizing, ensure chat is expanded
        if (maximized && !state.isChatExpanded) {
          return { isChatMaximized: true, isChatExpanded: true };
        }
        return { isChatMaximized: maximized };
      }),
      setIsThreadListVisible: (visible) => set((state) => {
        // Call coordination callback if provided (e.g., to close sidebar)
        state._onBeforeThreadListToggle?.(visible);
        return { isThreadListVisible: visible };
      }),
      toggleThreadListVisible: () => set((state) => {
        const visible = !state.isThreadListVisible;
        // Call coordination callback if provided (e.g., to close sidebar)
        state._onBeforeThreadListToggle?.(visible);
        return { isThreadListVisible: visible };
      }),
      setWorkspacePanelSize: (size) => set({ workspacePanelSize: size }),

      // Panel actions
      openPanel: (itemId, mode) => set((state) => {
        const MAX_PANELS = 2;
        let newPanelIds: string[];
        let newSelectedCardIds = new Set(state.selectedCardIds);

        if (mode === 'replace') {
          // Replace the last panel (or add if empty)
          if (state.openPanelIds.length === 0) {
            newPanelIds = [itemId];
          } else {
            // Remove the last panel from selection
            const lastPanelId = state.openPanelIds[state.openPanelIds.length - 1];
            newSelectedCardIds.delete(lastPanelId);
            // Replace last with new
            newPanelIds = [...state.openPanelIds.slice(0, -1), itemId];
          }
        } else {
          // Add mode - prepend (new item on left) if under limit
          if (state.openPanelIds.includes(itemId)) {
            // Already open, do nothing
            return state;
          }
          if (state.openPanelIds.length >= MAX_PANELS) {
            // At limit, replace first (leftmost) with new item, shifting others left
            const firstPanelId = state.openPanelIds[0];
            newSelectedCardIds.delete(firstPanelId);
            newPanelIds = [itemId, ...state.openPanelIds.slice(1)];
          } else {
            // Under limit, prepend (new item appears on left)
            newPanelIds = [itemId, ...state.openPanelIds];
          }
        }

        // Add new item to selection
        newSelectedCardIds.add(itemId);

        return {
          openPanelIds: newPanelIds,
          maximizedItemId: null, // Reset maximized when opening panels
          selectedCardIds: newSelectedCardIds,
        };
      }),

      closePanel: (itemId) => set((state) => {
        const newPanelIds = state.openPanelIds.filter(id => id !== itemId);
        const newSelectedCardIds = new Set(state.selectedCardIds);
        newSelectedCardIds.delete(itemId);

        return {
          openPanelIds: newPanelIds,
          selectedCardIds: newSelectedCardIds,
          maximizedItemId: state.maximizedItemId === itemId ? null : state.maximizedItemId,
        };
      }),

      closeAllPanels: () => set((state) => {
        // Remove all open panels from selection
        const newSelectedCardIds = new Set(state.selectedCardIds);
        state.openPanelIds.forEach(id => newSelectedCardIds.delete(id));

        return {
          openPanelIds: [],
          selectedCardIds: newSelectedCardIds,
          maximizedItemId: null,
        };
      }),

      reorderPanels: (fromIndex, toIndex) => set((state) => {
        if (fromIndex < 0 || fromIndex >= state.openPanelIds.length ||
          toIndex < 0 || toIndex >= state.openPanelIds.length) {
          return state;
        }
        const newPanelIds = [...state.openPanelIds];
        const [removed] = newPanelIds.splice(fromIndex, 1);
        newPanelIds.splice(toIndex, 0, removed);
        return { openPanelIds: newPanelIds };
      }),

      setItemPrompt: (prompt) => set({ itemPrompt: prompt }),
      setMaximizedItemId: (id) => set({ maximizedItemId: id }),

      // Legacy compatibility - maps to new panel actions
      setOpenModalItemId: (id) => set((state) => {
        if (id === null) {
          // Closing primary - if secondary exists, promote it
          if (state.openPanelIds.length > 1) {
            const newSelectedCardIds = new Set(state.selectedCardIds);
            newSelectedCardIds.delete(state.openPanelIds[0]);
            return {
              openPanelIds: state.openPanelIds.slice(1),
              selectedCardIds: newSelectedCardIds,
            };
          } else if (state.openPanelIds.length === 1) {
            const newSelectedCardIds = new Set(state.selectedCardIds);
            newSelectedCardIds.delete(state.openPanelIds[0]);
            return {
              openPanelIds: [],
              selectedCardIds: newSelectedCardIds,
            };
          }
          return state;
        } else {
          // Setting primary - replace first slot
          const newSelectedCardIds = new Set(state.selectedCardIds);
          if (state.openPanelIds.length > 0) {
            newSelectedCardIds.delete(state.openPanelIds[0]);
          }
          newSelectedCardIds.add(id);
          return {
            openPanelIds: [id, ...state.openPanelIds.slice(1)],
            maximizedItemId: null,
            selectedCardIds: newSelectedCardIds,
          };
        }
      }),

      setShowVersionHistory: (show) => set({ showVersionHistory: show }),
      setShowCreateWorkspaceModal: (show) => set({ showCreateWorkspaceModal: show }),
      setShowSheetModal: (show) => set({ showSheetModal: show }),


      // UI Preferences actions
      setShowJsonView: (show) => set({ showJsonView: show }),
      setSearchQuery: (query) => set({ searchQuery: query }),

      setActiveFolderId: (folderId) => set((state) => {
        // When directly selecting a folder (from sidebar or clicking folder card):
        // Push current folder to back history so user can navigate back
        const currentFolderId = state.activeFolderId;
        if (currentFolderId !== folderId) {
          return {
            activeFolderId: folderId,
            folderHistoryBack: [...state.folderHistoryBack, currentFolderId],
            folderHistoryForward: null, // Clear forward history on new navigation
          };
        }
        return { activeFolderId: folderId };
      }),
      clearActiveFolder: () => set((state) => {
        // When clearing folder (clicking root), just clear everything without adding to history
        // This prevents building up history when navigating back to root
        return {
          activeFolderId: null,
          folderHistoryBack: [],
          folderHistoryForward: null,
        };
      }),
      navigateFolderBack: () => set((state) => {
        // Navigate back: pop from back history, store current as forward destination (only one)
        if (state.folderHistoryBack.length === 0) return state;
        const previousFolderId = state.folderHistoryBack[state.folderHistoryBack.length - 1];
        const newBackHistory = state.folderHistoryBack.slice(0, -1);
        return {
          activeFolderId: previousFolderId,
          folderHistoryBack: newBackHistory,
          folderHistoryForward: state.activeFolderId, // Replace forward with current (only store last)
        };
      }),
      navigateFolderForward: () => set((state) => {
        // Navigate forward: go to forward destination, push current to back history
        if (state.folderHistoryForward === null) return state;
        const nextFolderId = state.folderHistoryForward;
        const newBackHistory = [...state.folderHistoryBack, state.activeFolderId];
        return {
          activeFolderId: nextFolderId,
          folderHistoryBack: newBackHistory,
          folderHistoryForward: null, // Clear forward after navigating
        };
      }),
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
        if (newSet.has(id)) {
          newSet.delete(id);
        } else {
          newSet.add(id);
        }
        return { selectedCardIds: newSet };
      }),
      clearCardSelection: () => set({ selectedCardIds: new Set<string>() }),
      selectMultipleCards: (ids) => set({ selectedCardIds: new Set(ids) }),
      setCardPlaying: (id, isPlaying) => set((state) => {
        const newSet = new Set(state.playingYouTubeCardIds);
        if (isPlaying) {
          newSet.add(id);
        } else {
          newSet.delete(id);
        }
        return { playingYouTubeCardIds: newSet };
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

      // Coordination actions
      setThreadListToggleCoordinator: (callback) => set({ _onBeforeThreadListToggle: callback }),

      // Utility actions
      resetChatState: () => set({
        isChatExpanded: initialState.isChatExpanded,
        isChatMaximized: initialState.isChatMaximized,
        workspacePanelSize: initialState.workspacePanelSize,
      }),

      closeAllModals: () => set((state) => {
        // Remove all open panels from selection
        const newSelectedCardIds = new Set(state.selectedCardIds);
        state.openPanelIds.forEach(id => newSelectedCardIds.delete(id));

        return {
          openPanelIds: [],
          itemPrompt: null,
          maximizedItemId: null,
          showVersionHistory: false,
          showCreateWorkspaceModal: false,
          showSheetModal: false,
          selectedCardIds: newSelectedCardIds,
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

