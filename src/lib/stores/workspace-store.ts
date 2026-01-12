import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/**
 * Workspace Store - Manages current workspace and save status
 * This replaces WorkspaceContext's currentWorkspaceId and save status tracking
 */
interface WorkspaceStoreState {
  // Current workspace
  currentWorkspaceId: string | null;
  
  // Save status
  isSaving: boolean;
  lastSavedAt: Date | null;
  hasUnsavedChanges: boolean;
  
  // Actions
  setCurrentWorkspaceId: (id: string | null) => void;
  updateSaveStatus: (isSaving: boolean) => void;
  updateLastSaved: (date: Date) => void;
  updateHasUnsavedChanges: (hasChanges: boolean) => void;
  
  // Utility
  resetSaveStatus: () => void;
}

export const useWorkspaceStore = create<WorkspaceStoreState>()(
  devtools(
    (set) => ({
      // Initial state
      currentWorkspaceId: null,
      isSaving: false,
      lastSavedAt: null,
      hasUnsavedChanges: false,
      
      // Actions
      setCurrentWorkspaceId: (id) => set({ currentWorkspaceId: id }),
      
      updateSaveStatus: (isSaving) => set({ isSaving }),
      
      updateLastSaved: (date) => set({ 
        lastSavedAt: date,
        hasUnsavedChanges: false,
      }),
      
      updateHasUnsavedChanges: (hasChanges) => set({ hasUnsavedChanges: hasChanges }),
      
      resetSaveStatus: () => set({
        isSaving: false,
        lastSavedAt: null,
        hasUnsavedChanges: false,
      }),
    }),
    { name: 'Workspace Store' }
  )
);

// Selectors
export const selectCurrentWorkspaceId = (state: WorkspaceStoreState) => state.currentWorkspaceId;

export const selectSaveStatus = (state: WorkspaceStoreState) => ({
  isSaving: state.isSaving,
  lastSavedAt: state.lastSavedAt,
  hasUnsavedChanges: state.hasUnsavedChanges,
});

