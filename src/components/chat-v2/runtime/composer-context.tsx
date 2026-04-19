"use client";

import { createContext, useContext } from "react";

export interface ComposerHandle {
  setText(text: string): void;
  appendText(text: string): void;
  addAttachment(file: File): Promise<void>;
  focus(): void;
  send(): void;
  getText(): string;
}

const ComposerContext = createContext<ComposerHandle | null>(null);

export const ComposerProvider = ComposerContext.Provider;

export function useComposer(): ComposerHandle {
  const ctx = useContext(ComposerContext);
  if (!ctx) throw new Error("useComposer must be used inside <ComposerProvider>");
  return ctx;
}

export function useComposerOptional(): ComposerHandle | null {
  return useContext(ComposerContext);
}
