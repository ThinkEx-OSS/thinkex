"use client";

import { createContext, useContext } from "react";
import type { ThinkexUIMessage } from "@/lib/chat/types";

export interface ThreadContextValue {
  threadId: string | null;
  messages: ThinkexUIMessage[];
}

const ThreadContext = createContext<ThreadContextValue | null>(null);

export const ThreadProvider = ThreadContext.Provider;

export function useThread(): ThreadContextValue {
  const ctx = useContext(ThreadContext);
  if (!ctx) throw new Error("useThread must be used inside <ThreadProvider>");
  return ctx;
}
