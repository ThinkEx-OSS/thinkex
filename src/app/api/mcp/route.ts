import { NextRequest, NextResponse } from "next/server";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createHash } from "crypto";
import { db, workspaces } from "@/lib/db/client";
import { apiKeys } from "@/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getCachedState } from "@/lib/mcp/workspace-cache";
import type { Item } from "@/lib/workspace-state/types";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_REGEX_LENGTH = 300;
const MAX_ID_LENGTH = 256;
const MAX_NAME_LENGTH = 500;
const MAX_PDF_PAGES = 50;    // ~25k words per call — fits comfortably in any modern model context window
const MAX_LINE_LIMIT = 2000; // ~20k words at typical prose density
const MIN_LINE_LIMIT = 1;
const DEFAULT_LINE_LIMIT = 500; // enough for a full section without requiring a follow-up call
const LIST_MAX_ITEMS = 200;  // items returned per list_workspace call; use search_workspace for larger workspaces

const VALID_ITEM_TYPES = new Set(["document", "pdf", "flashcard", "quiz", "audio", "image", "website", "youtube", "folder"]);

// Throws if the workspace does not belong to userId — prevents cross-user data access.
async function assertOwnsWorkspace(workspaceId: string, userId: string): Promise<void> {
  const [ws] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.userId, userId)))
    .limit(1);
  if (!ws) throw new McpAuthError("Workspace not found or access denied");
}

class McpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpAuthError";
  }
}

// Sanitise errors before sending to the caller — never leak raw DB messages.
function safeErrorMessage(error: unknown): string {
  if (error instanceof McpAuthError) return error.message;
  return "Internal server error";
}

function extractText(item: Item): string | null {
  switch (item.type) {
    case "document":
      return (item.data as any).markdown ?? null;
    case "pdf": {
      const pages = (item.data as any).ocrPages;
      return pages?.map((p: any) => p.markdown).join("\n\n") ?? null;
    }
    case "flashcard": {
      const cards = (item.data as any).cards ?? [];
      return cards.map((c: any) => `Q: ${c.front}\nA: ${c.back}`).join("\n\n");
    }
    case "quiz": {
      const questions = (item.data as any).questions ?? [];
      return questions
        .map((q: any) =>
          [q.questionText, ...(q.options ?? []), q.explanation]
            .filter(Boolean)
            .join("\n")
        )
        .join("\n\n") || null;
    }
    case "audio": {
      const transcript = (item.data as any).transcript;
      const summary = (item.data as any).summary;
      return [transcript, summary].filter(Boolean).join("\n\n") || null;
    }
    case "image": {
      const pages = (item.data as any).ocrPages;
      return pages?.map((p: any) => p.markdown).join("\n\n") ?? null;
    }
    case "website":
    case "youtube":
    case "folder":
    default:
      return null;
  }
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

async function authenticateRequest(req: NextRequest): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const rawKey = authHeader.substring(7);
  if (!rawKey.startsWith("tx_")) {
    return null;
  }

  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  const [key] = await db
    .select({ userId: apiKeys.userId, id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, keyHash), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!key) {
    return null;
  }

  db.update(apiKeys)
    .set({ lastUsedAt: new Date().toISOString() })
    .where(eq(apiKeys.id, key.id))
    .execute()
    .catch(() => {});

  return key.userId;
}

function createServer(userId: string): Server {
  const server = new Server(
    { name: "thinkex", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );
  registerTools(server, userId);
  return server;
}

function registerTools(server: Server, userId: string) {

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "list_workspaces",
          description: "List all workspaces for the authenticated user. Call this first if you don't know the workspaceId.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "list_workspace",
          description: "List items in a workspace (metadata only — no content). Returns up to 200 most-recently-modified items. If totalItems exceeds returned, use search_workspace to find specific items instead of calling list_workspace repeatedly.",
          inputSchema: {
            type: "object",
            properties: {
              workspaceId: { type: "string", description: "Workspace ID" },
              folderId: { type: "string", description: "Restrict to a specific folder (optional)" },
            },
            required: ["workspaceId"],
          },
        },
        {
          name: "get_recent",
          description: "Get the N most recently modified items in a workspace. Use this to orient yourself quickly before deciding what to read.",
          inputSchema: {
            type: "object",
            properties: {
              workspaceId: { type: "string", description: "Workspace ID" },
              limit: { type: "number", description: "Items to return (default 5, max 20)" },
            },
            required: ["workspaceId"],
          },
        },
        {
          name: "search_workspace",
          description: "Search item content by keyword or pattern. Returns matching snippets with item names and line numbers. Use this before read_item to locate the right section — it is far more token-efficient than loading full documents to scan manually.",
          inputSchema: {
            type: "object",
            properties: {
              workspaceId: { type: "string", description: "Workspace ID" },
              query: { type: "string", description: "Search keyword or regex pattern" },
              folderId: { type: "string", description: "Restrict to a folder (optional)" },
              type: { type: "string", description: "Restrict to an item type: document, pdf, flashcard, quiz, audio, image (optional)" },
              limit: { type: "number", description: "Snippets to return (default 5, max 10)" },
            },
            required: ["workspaceId", "query"],
          },
        },
        {
          name: "read_item",
          description: "Read the content of a named item. Fuzzy-matches the name. For text items use lineStart+limit; for PDFs use pageStart+pageEnd. The response includes hasMore and a note with the exact next call when the document continues beyond the current window.",
          inputSchema: {
            type: "object",
            properties: {
              workspaceId: { type: "string", description: "Workspace ID" },
              name: { type: "string", description: "Item name (fuzzy matched)" },
              lineStart: { type: "number", description: "Start line, 1-indexed (text items only, default 1)" },
              limit: { type: "number", description: "Lines to return (default 500, max 2000)" },
              pageStart: { type: "number", description: "Start page, 1-indexed (PDFs only, default 1)" },
              pageEnd: { type: "number", description: "End page inclusive (PDFs only, max 50 pages per call)" },
            },
            required: ["workspaceId", "name"],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case "list_workspaces": {
          const workspacesList = await db
            .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
            .from(workspaces)
            .where(eq(workspaces.userId, userId));

          return {
            content: [{ type: "text", text: JSON.stringify(workspacesList) }],
          };
        }

        case "list_workspace": {
          const { workspaceId, folderId } = args as { workspaceId: string; folderId?: string };
          await assertOwnsWorkspace(workspaceId, userId);
          const state = await getCachedState(workspaceId);
          let items = state.items;

          if (folderId !== undefined) {
            items = items.filter((i) => i.folderId === folderId);
          }

          const totalItems = items.length;

          // Sort most-recently-modified first so the cap preserves the most relevant items
          const sorted = [...items]
            .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
            .slice(0, LIST_MAX_ITEMS)
            .map((i) => ({ name: i.name, type: i.type, folderId: i.folderId ?? null, lastModified: i.lastModified }));

          const result: Record<string, unknown> = {
            items: sorted,
            returned: sorted.length,
            totalItems,
          };
          if (totalItems > LIST_MAX_ITEMS) {
            result.hint = `Showing ${LIST_MAX_ITEMS} most-recent of ${totalItems} items. Use search_workspace() to find specific items by name or content.`;
          }

          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
          };
        }

        case "get_recent": {
          const { workspaceId, limit } = args as { workspaceId: string; limit?: number };
          await assertOwnsWorkspace(workspaceId, userId);
          const state = await getCachedState(workspaceId);
          const recentLimit = Math.min(limit ?? 5, 20);

          const recent = [...state.items]
            .filter((i) => i.lastModified)
            .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
            .slice(0, recentLimit)
            .map((i) => ({ name: i.name, type: i.type, folderId: i.folderId ?? null, lastModified: i.lastModified }));

          return {
            content: [{ type: "text", text: JSON.stringify(recent) }],
          };
        }

        case "search_workspace": {
          const { workspaceId, query, folderId, type, limit } = args as {
            workspaceId: string;
            query: string;
            folderId?: string;
            type?: string;
            limit?: number;
          };
          await assertOwnsWorkspace(workspaceId, userId);

          if (typeof query !== "string" || query.length === 0 || query.length > MAX_REGEX_LENGTH) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: `Query must be a non-empty string of at most ${MAX_REGEX_LENGTH} characters` }) }],
              isError: true,
            };
          }

          if (type !== undefined && !VALID_ITEM_TYPES.has(type)) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: `Unknown item type "${type}". Valid types: ${[...VALID_ITEM_TYPES].join(", ")}` }) }],
              isError: true,
            };
          }

          const state = await getCachedState(workspaceId);
          let items = state.items;

          if (folderId !== undefined) {
            items = items.filter((i) => i.folderId === folderId);
          }
          if (type !== undefined) {
            items = items.filter((i) => i.type === type);
          }

          // Use case-insensitive flag only (no `g`) to avoid lastIndex state bleeding
          // between test() calls on separate lines, which causes matches to be skipped.
          let regex: RegExp;
          try {
            regex = new RegExp(query, "i");
          } catch {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: "Invalid regex pattern" }),
                },
              ],
              isError: true,
            };
          }

          const matches: Array<{
            itemName: string;
            itemType: string;
            folderId: string | null;
            lineStart: number;
            content: string;
          }> = [];
          const INTERNAL_CAP = 100;

          for (const item of items) {
            const text = extractText(item);
            if (!text) continue;

            const lines = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                matches.push({
                  itemName: item.name,
                  itemType: item.type,
                  folderId: item.folderId ?? null,
                  lineStart: i + 1,
                  content: lines[i].trim(),
                });
                if (matches.length >= INTERNAL_CAP) break;
              }
            }
            if (matches.length >= INTERNAL_CAP) break;
          }

          if (matches.length === 0) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ results: [], suggestion: "No matches found. Try list_workspace() to browse available items or broaden your query." }),
              }],
            };
          }

          const resultLimit = Math.min(Math.max(limit ?? 5, 1), 10);
          return {
            content: [{ type: "text", text: JSON.stringify(matches.slice(0, resultLimit)) }],
          };
        }

        case "read_item": {
          const { workspaceId, name, lineStart, limit, pageStart, pageEnd } = args as {
            workspaceId: string;
            name: string;
            lineStart?: number;
            limit?: number;
            pageStart?: number;
            pageEnd?: number;
          };
          await assertOwnsWorkspace(workspaceId, userId);

          if (typeof name !== "string" || name.length === 0 || name.length > MAX_NAME_LENGTH) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: `name must be a non-empty string of at most ${MAX_NAME_LENGTH} characters` }) }],
              isError: true,
            };
          }

          const state = await getCachedState(workspaceId);

          const nameLower = name.toLowerCase();
          let matchedItem: Item | null = null;

          const exactMatch = state.items.find((i) => i.name.toLowerCase() === nameLower);
          if (exactMatch) {
            matchedItem = exactMatch;
          } else {
            const substringMatches = state.items.filter((i) =>
              i.name.toLowerCase().includes(nameLower)
            );
            if (substringMatches.length === 1) {
              matchedItem = substringMatches[0];
            } else if (substringMatches.length > 1) {
              let closestItem = substringMatches[0];
              let closestDistance = levenshteinDistance(nameLower, closestItem.name.toLowerCase());
              for (const item of substringMatches.slice(1)) {
                const distance = levenshteinDistance(nameLower, item.name.toLowerCase());
                if (distance < closestDistance) {
                  closestDistance = distance;
                  closestItem = item;
                }
              }
              matchedItem = closestItem;
            }
          }

          if (!matchedItem) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: "Item not found. Try list_workspace() to see available items." }) }],
              isError: true,
            };
          }

          if (matchedItem.type === "pdf") {
            const pages = ((matchedItem.data as any).ocrPages ?? []) as Array<{ markdown: string }>;
            const totalPages = pages.length;

            // Clamp pageStart to a valid 1-based page number
            const clampedStart = Math.max(1, Math.floor(pageStart ?? 1));
            if (clampedStart > totalPages) {
              return {
                content: [{ type: "text", text: JSON.stringify({ error: `pageStart (${clampedStart}) exceeds total pages (${totalPages})` }) }],
                isError: true,
              };
            }

            // Cap the window: if pageEnd is supplied, honour it but never exceed MAX_PDF_PAGES per request
            const requestedEnd = pageEnd !== undefined ? Math.floor(pageEnd) : clampedStart + MAX_PDF_PAGES - 1;
            if (requestedEnd < clampedStart) {
              return {
                content: [{ type: "text", text: JSON.stringify({ error: "pageEnd must be >= pageStart" }) }],
                isError: true,
              };
            }
            const clampedEnd = Math.min(requestedEnd, clampedStart + MAX_PDF_PAGES - 1, totalPages);

            const content = pages
              .slice(clampedStart - 1, clampedEnd)
              .map((p) => p.markdown)
              .join("\n\n---\n\n");

            const pdfResult: Record<string, unknown> = {
              itemName: matchedItem.name,
              itemType: matchedItem.type,
              content,
              estimatedTokens: Math.ceil(content.length / 4),
              pageStart: clampedStart,
              pageEnd: clampedEnd,
              totalPages,
              hasMore: clampedEnd < totalPages,
            };
            if (clampedEnd < totalPages) {
              pdfResult.note = `Showing pages ${clampedStart}–${clampedEnd} of ${totalPages}. Call read_item again with pageStart=${clampedEnd + 1} for the next section.`;
            }

            return { content: [{ type: "text", text: JSON.stringify(pdfResult) }] };
          }

          const text = extractText(matchedItem);
          if (!text) {
            const url = (matchedItem.data as any).url;
            return {
              content: [{ type: "text", text: JSON.stringify({ content: null, note: `This item has no stored body text. URL: ${url ?? "N/A"}` }) }],
            };
          }

          const lines = text.split("\n");
          const totalLines = lines.length;

          const clampedLineStart = Math.max(1, Math.floor(lineStart ?? 1));
          if (clampedLineStart > totalLines) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: `lineStart (${clampedLineStart}) exceeds total lines (${totalLines})` }) }],
              isError: true,
            };
          }

          const lineLimit = Math.min(Math.max(Math.floor(limit ?? DEFAULT_LINE_LIMIT), MIN_LINE_LIMIT), MAX_LINE_LIMIT);
          const slice = lines.slice(clampedLineStart - 1, clampedLineStart - 1 + lineLimit);
          const content = slice.join("\n");
          const returnedEnd = clampedLineStart - 1 + slice.length;

          const textResult: Record<string, unknown> = {
            itemName: matchedItem.name,
            itemType: matchedItem.type,
            content,
            estimatedTokens: Math.ceil(content.length / 4),
            lineStart: clampedLineStart,
            lineEnd: returnedEnd,
            totalLines,
            hasMore: returnedEnd < totalLines,
          };
          if (returnedEnd < totalLines) {
            textResult.note = `Showing lines ${clampedLineStart}–${returnedEnd} of ${totalLines}. Call read_item again with lineStart=${returnedEnd + 1} for the next section.`;
          }

          return { content: [{ type: "text", text: JSON.stringify(textResult) }] };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: `Unknown tool: ${name}` }),
              },
            ],
            isError: true,
          };
      }
    } catch (error: unknown) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: safeErrorMessage(error) }),
          },
        ],
        isError: true,
      };
    }
  });
}

async function handleMCP(req: NextRequest) {
  // Enforce body size limit before doing anything else
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request body too large" }, { status: 413 });
  }

  const userId = await authenticateRequest(req);
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const server = createServer(userId);

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" },
    }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32600, message: "Invalid request" },
    }, { status: 400 });
  }

  const { method, params, id: rawId } = body as Record<string, unknown>;

  // JSON-RPC id must be a string, number, or null — never reflect arbitrary values
  const id: string | number | null =
    typeof rawId === "string" && rawId.length <= MAX_ID_LENGTH ? rawId
    : typeof rawId === "number" && Number.isFinite(rawId) ? rawId
    : null;

  try {
    if (method === "tools/list") {
      const response = await server.request({ method: "tools/list", params: params as any }, ListToolsRequestSchema);
      return NextResponse.json({ jsonrpc: "2.0", id, result: response });
    } else if (method === "tools/call") {
      const response = await server.request({ method: "tools/call", params: params as any }, CallToolRequestSchema);
      return NextResponse.json({ jsonrpc: "2.0", id, result: response });
    } else {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: "Method not found" },
      });
    }
  } catch {
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: "Internal error" },
    }, { status: 500 });
  }
}

export const POST = handleMCP;

// Allow up to 30s for workspace state loading on large workspaces
export const maxDuration = 30;
