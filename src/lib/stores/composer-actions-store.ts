import { create } from "zustand";

export interface ComposerActions {
  setInput: (value: string) => void;
  addAttachments: (files: File[] | FileList) => Promise<void>;
  focusInput: (options?: { cursorAtEnd?: boolean }) => void;
  submit: () => Promise<void>;
}

interface ComposerActionsState {
  composerActions: ComposerActions | null;
  setComposerActions: (composerActions: ComposerActions | null) => void;
}

export const useComposerActionsStore = create<ComposerActionsState>()((set) => ({
  composerActions: null,
  setComposerActions: (composerActions) => set({ composerActions }),
}));

export function useOptionalComposerActions(): ComposerActions | null {
  return useComposerActionsStore((state) => state.composerActions);
}
