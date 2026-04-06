import type { Item } from "@/lib/workspace-state/types";

export const EMPTY_THREAD_ITEMS: Item[] = [];
export const THREAD_MAX_WIDTH = "50rem";
export const USER_MESSAGE_MAX_CHARS = 250;

export type ThreadStateWithMainThreadId = {
  mainThreadId?: string;
};
