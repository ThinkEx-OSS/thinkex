import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import { WORKSPACE_PANEL_SIZES } from '@/lib/layout-constants';

/**
 * UI Store - Manages all UI state (chat, modals, search, layout, text selection)
 * This replaces scattered useState hooks in dashboard
 */

export type ViewMode = 'workspace' | 'focus' | 'workspace+panel' | 'panel+panel';

interface UIState {
  // Chat state
  isChatExpanded: boolean;
  isChatMaximized: boolean;
  isThreadListVisible: boolean;

  // Layout state
  workspacePanelSize: number; // percentage (0-100)

  // View mode & Panel state
  viewMode: ViewMode; // Current layout mode
  openPanelIds: string[]; // Array of open item IDs (order = layout order, max 2)
  itemPrompt: { itemId: string; x: number; y: number } | null; // Global prompt state
  maximizedItemId: string | null; // The ID of the item currently expanded to full screen (focus mode)


  // Modal state
  showVersionHistory: boolean;
  showCreateWorkspaceModal: boolean;
  showSheetModal: boolean;
  showJsonView: boolean;
  searchQuery: string;

  activeFolderId: string | null; // Active folder for filtering
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

  // Citation highlight: when opening note/PDF from citation click, highlight/search this quote
  citationHighlightQuery: { itemId: string; query: string } | null;

  // Actions - Chat
  setIsChatExpanded: (expanded: boolean) => void;
  toggleChatExpanded: () => void;
  setIsChatMaximized: (maximized: boolean) => void;
  toggleChatMaximized: () => void;
  setIsThreadListVisible: (visible: boolean) => void;
  toggleThreadListVisible: () => void;
  setWorkspacePanelSize: (size: number) => void;


  // Actions - Panels & View Mode
  openPanel: (itemId: string, mode: 'replace' | 'add') => void;
  splitWithItem: (itemId: string) => void; // Enter panel+panel mode from workspace+panel
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
  setCitationHighlightQuery: (query: { itemId: string; query: string } | null) => void;

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

  // View mode & Panels
  viewMode: 'workspace' as ViewMode,
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
  selectedModelId: 'gemini-3-flash-preview',

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
  citationHighlightQuery: null,
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

        // URL sync only — sets panels and optionally maximized (focus) item
        _setPanelsFromUrl: (ids, maximizedId) => set((state) => {
          const validIds = ids.slice(0, 2); // max 2 panels
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
            newPanelAutoSelectedCardIds.add(id);
          });
          state.panelAutoSelectedCardIds.forEach(id => {
            if (!validIds.includes(id)) newSelectedCardIds.delete(id);
          });
          // Focus only valid when single panel and maximizedId in validIds
          const focusId =
            maximizedId &&
            validIds.length === 1 &&
            validIds[0] === maximizedId
              ? maximizedId
              : null;
          const viewMode: ViewMode =
            focusId
              ? 'focus'
              : validIds.length === 2
                ? 'panel+panel'
                : 'workspace+panel';
          return {
            openPanelIds: validIds,
            maximizedItemId: focusId,
            viewMode,
            selectedCardIds: newSelectedCardIds,
            panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
          };
        }),

        // Panel actions
        openPanel: (itemId, mode) => {
          set((state) => {
            const newSelectedCardIds = new Set(state.selectedCardIds);
            const newPanelAutoSelectedCardIds = new Set(state.panelAutoSelectedCardIds);

            if (mode === 'replace') {
              // In workspace+panel mode: replace the panel content
              // If no panels open yet, enter workspace+panel mode
              // Only skip if we're already in workspace+panel with this exact item
              const isAlreadyOpen = state.viewMode === 'workspace+panel' && state.openPanelIds.length === 1 && state.openPanelIds[0] === itemId;
              if (isAlreadyOpen) return {};

              // Clean up old auto-selected cards
              state.panelAutoSelectedCardIds.forEach(id => newSelectedCardIds.delete(id));
              newPanelAutoSelectedCardIds.clear();

              // Add new item to selections
              newSelectedCardIds.add(itemId);
              newPanelAutoSelectedCardIds.add(itemId);

              return {
                viewMode: 'workspace+panel' as ViewMode,
                openPanelIds: [itemId],
                maximizedItemId: null,
                selectedCardIds: newSelectedCardIds,
                panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
              };
            }

            // mode === 'add' — not used directly, use splitWithItem instead
            return {};
          });
        },

        // Enter panel+panel mode from workspace+panel
        splitWithItem: (itemId) => {
          set((state) => {
            if (state.openPanelIds.length === 0) return {};
            const existingId = state.openPanelIds[0];
            if (existingId === itemId) return {}; // Can't split with the same item

            const newSelectedCardIds = new Set(state.selectedCardIds);
            const newPanelAutoSelectedCardIds = new Set(state.panelAutoSelectedCardIds);
            newSelectedCardIds.add(itemId);
            newPanelAutoSelectedCardIds.add(itemId);

            return {
              viewMode: 'panel+panel' as ViewMode,
              openPanelIds: [itemId, existingId],
              maximizedItemId: null,
              selectedCardIds: newSelectedCardIds,
              panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
            };
          });
        },

        closePanel: (itemId) => {
          set((state) => {
            if (state.openPanelIds.length === 0) return {};

            const remaining = state.openPanelIds.filter(id => id !== itemId);
            const newSelectedCardIds = new Set(state.selectedCardIds);

            // Remove the closed item from auto-selected if it was auto-selected
            if (state.panelAutoSelectedCardIds.has(itemId)) {
              newSelectedCardIds.delete(itemId);
            }
            const newPanelAutoSelectedCardIds = new Set(state.panelAutoSelectedCardIds);
            newPanelAutoSelectedCardIds.delete(itemId);

            if (remaining.length === 0) {
              // No panels left → workspace mode
              return {
                viewMode: 'workspace' as ViewMode,
                openPanelIds: [],
                maximizedItemId: null,
                selectedCardIds: newSelectedCardIds,
                panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
                citationHighlightQuery: null,
              };
            }

            // One panel remaining → workspace+panel
            return {
              viewMode: 'workspace+panel' as ViewMode,
              openPanelIds: remaining,
              maximizedItemId: null,
              selectedCardIds: newSelectedCardIds,
              panelAutoSelectedCardIds: newPanelAutoSelectedCardIds,
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

        reorderPanels: (fromIndex, toIndex) => set((state) => {
          const newPanelIds = [...state.openPanelIds];
          const [removed] = newPanelIds.splice(fromIndex, 1);
          newPanelIds.splice(toIndex, 0, removed);
          return { openPanelIds: newPanelIds };
        }),

        setItemPrompt: (prompt) => set({ itemPrompt: prompt }),
        setMaximizedItemId: (id) => set({
          maximizedItemId: id,
          viewMode: id ? 'focus' as ViewMode : 'workspace' as ViewMode,
          // When entering focus mode, keep openPanelIds for breadcrumb; when leaving, clear
          ...(id === null ? { openPanelIds: [] } : { openPanelIds: [id] }),
        }),

        // Workspace Split View actions


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

              // Add to selections and track as auto-selected
              newSelectedCardIds.add(id);
              newPanelAutoSelectedCardIds.add(id);

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

        setShowVersionHistory: (show) => set({ showVersionHistory: show }),
        setShowCreateWorkspaceModal: (show) => set({ showCreateWorkspaceModal: show }),
        setShowSheetModal: (show) => set({ showSheetModal: show }),

        // UI Preferences actions
        setShowJsonView: (show) => set({ showJsonView: show }),
        setSearchQuery: (query) => set({ searchQuery: query }),

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
        setCitationHighlightQuery: (query) => {
          set({ citationHighlightQuery: query });
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
            viewMode: 'workspace' as ViewMode,
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
      {
        name: 'thinkex-ui-preferences',
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
  showVersionHistory: state.showVersionHistory,
  showCreateWorkspaceModal: state.showCreateWorkspaceModal,
  showSheetModal: state.showSheetModal,
});

// View mode selector
export const selectViewMode = (state: UIState) => state.viewMode;

// Panel selectors - for backwards compatibility and convenience
export const selectOpenPanelIds = (state: UIState) => state.openPanelIds;
export const selectPrimaryPanelId = (state: UIState) => state.openPanelIds[0] ?? null;
export const selectSecondaryPanelId = (state: UIState) => state.openPanelIds[1] ?? null;

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

