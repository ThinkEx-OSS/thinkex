/**
 * Chat debug helpers — both client and server.
 *
 * Goal: produce one-line, grep-able summaries of UIMessage shapes at every
 * stage of the persist/hydrate pipeline so we can isolate where content is
 * being lost. Designed for the bug where a refreshed thread shows user
 * messages with content but assistant messages render empty.
 *
 * Logging is opt-in:
 *   - server: always on (uses console.info via the project logger).
 *   - client: enabled when `localStorage.chatDebug = "1"` OR
 *             `process.env.NEXT_PUBLIC_CHAT_DEBUG === "1"`.
 */

import type { UIMessage } from "ai";

export const CHAT_DEBUG_TAG = "[chat-debug]";

interface PartSummary {
  type: string;
  /** Length of `text` field in characters, only set for text-bearing parts. */
  textLen?: number;
  /** State for `tool-*` and `step-start` parts when present. */
  state?: string;
}

export interface MessageSummary {
  id: string;
  role: string;
  partCount: number;
  parts: PartSummary[];
  /** Concatenated text length across `text`/`reasoning` parts. */
  textTotal: number;
  hasMetadata: boolean;
}

function summarizePart(part: unknown): PartSummary {
  if (!part || typeof part !== "object") {
    return { type: typeof part };
  }
  const p = part as Record<string, unknown>;
  const type = typeof p.type === "string" ? p.type : "unknown";
  const summary: PartSummary = { type };
  if (typeof p.text === "string") summary.textLen = p.text.length;
  if (typeof p.state === "string") summary.state = p.state;
  return summary;
}

export function summarizeMessage(message: unknown): MessageSummary {
  if (!message || typeof message !== "object") {
    return {
      id: "<not-an-object>",
      role: typeof message,
      partCount: 0,
      parts: [],
      textTotal: 0,
      hasMetadata: false,
    };
  }
  const m = message as Partial<UIMessage> & { metadata?: unknown };
  const parts = Array.isArray(m.parts) ? m.parts : [];
  const summarized = parts.map(summarizePart);
  const textTotal = summarized.reduce(
    (acc, p) => acc + (p.textLen ?? 0),
    0,
  );
  return {
    id: String(m.id ?? "<no-id>"),
    role: String(m.role ?? "<no-role>"),
    partCount: parts.length,
    parts: summarized,
    textTotal,
    hasMetadata:
      m.metadata != null && typeof m.metadata === "object",
  };
}

export function summarizeMessages(
  messages: readonly unknown[],
): MessageSummary[] {
  return messages.map(summarizeMessage);
}

/** Quick role/part-count breakdown for a list of messages. */
export function summarizeRoster(messages: readonly unknown[]): {
  total: number;
  byRole: Record<string, number>;
  emptyAssistants: string[];
} {
  const byRole: Record<string, number> = {};
  const emptyAssistants: string[] = [];
  for (const msg of messages) {
    const s = summarizeMessage(msg);
    byRole[s.role] = (byRole[s.role] ?? 0) + 1;
    if (s.role === "assistant" && s.textTotal === 0 && s.partCount === 0) {
      emptyAssistants.push(s.id);
    }
  }
  return { total: messages.length, byRole, emptyAssistants };
}

/* -------------------------------------------------------------------------- */
/*                              client-only API                                */
/* -------------------------------------------------------------------------- */

function isChatDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.localStorage?.getItem("chatDebug") === "1") return true;
  } catch {
    /* localStorage may be blocked; fall through */
  }
  if (process.env.NEXT_PUBLIC_CHAT_DEBUG === "1") return true;
  return false;
}

/**
 * Client-side debug logger. No-op unless explicitly enabled to avoid noise
 * in production. Uses `console.info` so it's filterable in DevTools.
 */
export function chatDebug(label: string, ...args: unknown[]): void {
  if (!isChatDebugEnabled()) return;
  console.info(`${CHAT_DEBUG_TAG} ${label}`, ...args);
}

/**
 * Always-on warn variant for anomalies that should surface even when the
 * verbose `chatDebug` toggle is off (e.g. assistant message with 0 parts).
 */
export function chatWarn(label: string, ...args: unknown[]): void {
  if (typeof console === "undefined") return;
  console.warn(`${CHAT_DEBUG_TAG} ${label}`, ...args);
}
