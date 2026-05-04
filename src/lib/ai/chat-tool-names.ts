/**
 * Canonical chat tool names: `{scope}_{action}` (e.g. web_search, web_fetch).
 * Legacy camelCase and older snake_case names are accepted in persisted UI
 * messages — see LEGACY_CHAT_TOOL_NAMES.
 */

export const CHAT_TOOL = {
  WEB_FETCH: "web_fetch",
  WEB_MAP: "web_map",
  WEB_SEARCH: "web_search",
  WORKSPACE_SEARCH: "workspace_search",
  WORKSPACE_READ: "workspace_read",
  DOCUMENT_CREATE: "document_create",
  ITEM_EDIT: "item_edit",
  ITEM_DELETE: "item_delete",
  FLASHCARDS_CREATE: "flashcards_create",
  QUIZ_CREATE: "quiz_create",
  YOUTUBE_SEARCH: "youtube_search",
  YOUTUBE_ADD: "youtube_add",
  CODE_EXECUTE: "code_execute",
  QUIZ_ADD_QUESTIONS: "quiz_add_questions",
  FLASHCARD_ADD_CARDS: "flashcard_add_cards",
} as const;

export type ChatToolName = (typeof CHAT_TOOL)[keyof typeof CHAT_TOOL];
const CANONICAL_CHAT_TOOL_NAMES = new Set<string>(Object.values(CHAT_TOOL));

/** Older tool name → canonical */
export const LEGACY_CHAT_TOOL_NAMES: Record<string, ChatToolName> = {
  // Original camelCase
  processUrls: CHAT_TOOL.WEB_FETCH,
  urlFetch: CHAT_TOOL.WEB_FETCH,
  webSearch: CHAT_TOOL.WEB_SEARCH,
  searchWorkspace: CHAT_TOOL.WORKSPACE_SEARCH,
  readWorkspace: CHAT_TOOL.WORKSPACE_READ,
  createDocument: CHAT_TOOL.DOCUMENT_CREATE,
  editItem: CHAT_TOOL.ITEM_EDIT,
  deleteItem: CHAT_TOOL.ITEM_DELETE,
  createFlashcards: CHAT_TOOL.FLASHCARDS_CREATE,
  createQuiz: CHAT_TOOL.QUIZ_CREATE,
  searchYoutube: CHAT_TOOL.YOUTUBE_SEARCH,
  addYoutubeVideo: CHAT_TOOL.YOUTUBE_ADD,
  executeCode: CHAT_TOOL.CODE_EXECUTE,
  // Intermediate snake_case (pre–resource_action rename)
  process_urls: CHAT_TOOL.WEB_FETCH,
  search_workspace: CHAT_TOOL.WORKSPACE_SEARCH,
  read_workspace: CHAT_TOOL.WORKSPACE_READ,
  create_document: CHAT_TOOL.DOCUMENT_CREATE,
  edit_item: CHAT_TOOL.ITEM_EDIT,
  delete_item: CHAT_TOOL.ITEM_DELETE,
  create_flashcards: CHAT_TOOL.FLASHCARDS_CREATE,
  create_quiz: CHAT_TOOL.QUIZ_CREATE,
  search_youtube: CHAT_TOOL.YOUTUBE_SEARCH,
  add_youtube_video: CHAT_TOOL.YOUTUBE_ADD,
  youtube_video_add: CHAT_TOOL.YOUTUBE_ADD,
};

const canonicalToLegacy = (() => {
  const m = new Map<string, string[]>();
  for (const [legacy, canonical] of Object.entries(LEGACY_CHAT_TOOL_NAMES)) {
    const list = m.get(canonical) ?? [];
    list.push(legacy);
    m.set(canonical, list);
  }
  return m;
})();

export function getLegacyChatToolAliases(canonical: string): string[] {
  return canonicalToLegacy.get(canonical) ?? [];
}

/** Map `tool-{name}` part types to canonical tool-* types. */
export function canonicalizeToolUIPartType(partType: string): string {
  if (!partType.startsWith("tool-")) return partType;
  const suffix = partType.slice("tool-".length);
  const mapped = LEGACY_CHAT_TOOL_NAMES[suffix];
  return mapped ? `tool-${mapped}` : partType;
}

export function toolPartMatchesCanonical(
  partType: string | undefined,
  canonical: ChatToolName,
): boolean {
  if (!partType?.startsWith("tool-")) return false;
  const suffix = partType.slice("tool-".length);
  if (suffix === canonical) return true;
  return LEGACY_CHAT_TOOL_NAMES[suffix] === canonical;
}

export function isCanonicalChatToolName(name: string): name is ChatToolName {
  return CANONICAL_CHAT_TOOL_NAMES.has(name);
}

/** Autogen / SSE events that mirror the web search tool */
export function matchesWebSearchStreamToolName(name: string | undefined): boolean {
  return name === CHAT_TOOL.WEB_SEARCH || name === "webSearch";
}
