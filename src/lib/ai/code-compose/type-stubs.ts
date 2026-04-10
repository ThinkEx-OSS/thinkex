/**
 * Generate TypeScript type stubs for external_* functions from tool schemas.
 * These stubs are embedded in the system prompt so the LLM sees typed signatures.
 * The LLM writes JS (not TS), but the stubs serve as documentation.
 */

/** Tool schemas for code compose — manually curated for clarity. */
interface ExternalToolSpec {
  /** Function name inside the sandbox (e.g. "searchWeb") */
  name: string;
  /** Human-readable description */
  description: string;
  /** TypeScript input type as a string */
  inputType: string;
  /** TypeScript return type as a string */
  returnType: string;
}

/**
 * All 11 tools exposed inside the code_compose sandbox.
 * code_execute is excluded (it's already a sandbox — nesting sandboxes is pointless).
 *
 * Names use camelCase inside the sandbox for JS ergonomics:
 *   external_searchWeb(), external_fetchUrls(), etc.
 *
 * These are hardcoded rather than auto-generated from Zod schemas because:
 * 1. We want clean, LLM-friendly type names (not raw Zod JSON Schema)
 * 2. We can add JSDoc-style hints the model understands
 * 3. There are only 11 tools — maintenance cost is near zero
 * 4. Auto-generation from zodSchema().jsonSchema is lossy (loses descriptions, unions become anyOf, etc.)
 */
export const EXTERNAL_TOOL_SPECS: ExternalToolSpec[] = [
  {
    name: "searchWeb",
    description: "Search the web for current information",
    inputType: "{ query: string }",
    returnType:
      "{ text: string, sources?: Array<{ title: string, url: string }> }",
  },
  {
    name: "fetchUrls",
    description: "Fetch content from web pages (max 20 URLs)",
    inputType: "{ urls: string[] }",
    returnType:
      "{ text: string, metadata?: { urlMetadata?: Array<{ retrievedUrl: string, urlRetrievalStatus: string }>, sources?: Array<{ uri: string, title: string }> } }",
  },
  {
    name: "searchWorkspace",
    description:
      "Grep search across workspace items. Returns matching lines with line numbers.",
    inputType: "{ pattern: string, include?: string, path?: string }",
    returnType:
      "{ success: boolean, matches: number, truncated?: boolean, output: string }",
  },
  {
    name: "readWorkspace",
    description:
      "Read content of a workspace item by path or name. Returns raw lines (no line-number prefixes).",
    inputType:
      "{ path?: string, itemName?: string, lineStart?: number, limit?: number, pageStart?: number, pageEnd?: number }",
    returnType:
      "{ success: boolean, itemName?: string, type?: string, path?: string, content?: string, totalLines?: number, lineStart?: number, lineEnd?: number, hasMore?: boolean, message?: string }",
  },
  {
    name: "createDocument",
    description: "Create a document card in the workspace",
    inputType:
      "{ title: string, content: string, sources?: Array<{ title: string, url: string, favicon?: string }> }",
    returnType: "{ success: boolean, message: string }",
  },
  {
    name: "editItem",
    description:
      "Edit a document, flashcard deck, quiz, or PDF (rename only for PDFs). Use oldString='' for full rewrite.",
    inputType:
      "{ itemName: string, oldString: string, newString: string, replaceAll?: boolean, newName?: string, sources?: Array<{ title: string, url: string, favicon?: string }> }",
    returnType: "{ success: boolean, message: string }",
  },
  {
    name: "deleteItem",
    description: "Permanently delete a workspace item by name",
    inputType: "{ itemName: string }",
    returnType: "{ success: boolean, message: string }",
  },
  {
    name: "createFlashcards",
    description: "Create a new flashcard deck",
    inputType:
      "{ title: string | null, cards: Array<{ front: string, back: string }> }",
    returnType: "{ success: boolean, message: string }",
  },
  {
    name: "createQuiz",
    description: "Create a quiz with multiple-choice questions",
    inputType:
      "{ title?: string, questions: Array<{ type: string, questionText: string, options: string[], correctIndex: number, hint?: string, explanation?: string }> }",
    returnType: "{ success: boolean, message: string }",
  },
  {
    name: "searchYoutube",
    description: "Search for YouTube videos",
    inputType: "{ query: string }",
    returnType:
      "{ success: boolean, videos?: Array<{ id: string, title: string, description: string, thumbnail: string }> }",
  },
  {
    name: "addYoutubeVideo",
    description: "Add a YouTube video to the workspace",
    inputType: "{ videoId: string, title: string }",
    returnType: "{ success: boolean, message: string }",
  },
];

/**
 * Generate the type stubs block for the system prompt.
 * Format: a TypeScript declaration block the LLM can reference.
 */
export function generateTypeStubs(): string {
  const lines = [
    "// Available functions inside code_compose sandbox",
    "// All functions are async. Call with: await external_<name>(<args>)",
    "// Use Promise.all() to parallelize independent calls.",
    "",
  ];

  for (const spec of EXTERNAL_TOOL_SPECS) {
    lines.push(`/** ${spec.description} */`);
    lines.push(
      `declare function external_${spec.name}(input: ${spec.inputType}): Promise<${spec.returnType}>;`,
    );
    lines.push("");
  }

  lines.push("/** Log debug output (visible in execution trace) */");
  lines.push("declare function console_log(...args: any[]): void;");

  return lines.join("\n");
}

/**
 * Mapping from sandbox function name → canonical CHAT_TOOL name.
 * Used by the tool bridge to route external_* calls to real tool executors.
 */
export const SANDBOX_TO_CANONICAL: Record<string, string> = {
  searchWeb: "web_search",
  fetchUrls: "web_fetch",
  searchWorkspace: "workspace_search",
  readWorkspace: "workspace_read",
  createDocument: "document_create",
  editItem: "item_edit",
  deleteItem: "item_delete",
  createFlashcards: "flashcards_create",
  createQuiz: "quiz_create",
  searchYoutube: "youtube_search",
  addYoutubeVideo: "youtube_add",
};
