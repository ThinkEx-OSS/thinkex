import { jsonrepair } from "jsonrepair";

type ParsedJsonResult<T = unknown> = {
  value: T;
  repaired: boolean;
  repairedText?: string;
};

function unwrapCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n?```$/);
  return match ? match[1] : text;
}

function normalizeSmartQuotes(text: string): string {
  return text
    .replaceAll("\u2018", "'")
    .replaceAll("\u2019", "'")
    .replaceAll("\u201C", '"')
    .replaceAll("\u201D", '"');
}

export function parseJsonWithRepair<T = unknown>(raw: string): ParsedJsonResult<T> {
  const base = unwrapCodeFence(normalizeSmartQuotes(raw)).trim();
  try {
    return { value: JSON.parse(base) as T, repaired: false };
  } catch {
    // Fall through to jsonrepair.
  }

  try {
    const candidate = jsonrepair(base);
    return {
      value: JSON.parse(candidate) as T,
      repaired: true,
      repairedText: candidate,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON after repair attempt: ${detail}`);
  }
}

