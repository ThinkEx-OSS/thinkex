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
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import type { AgentState, Item } from "@/lib/workspace-state/types";

const stateCache = new Map<string, { state: AgentState; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

async function getCachedState(workspaceId: string): Promise<AgentState> {
  const cached = stateCache.get(workspaceId);
  if (cached && cached.expiresAt > Date.now()) return cached.state;

  const state = await loadWorkspaceState(workspaceId);
  stateCache.set(workspaceId, { state, expiresAt: Date.now() + CACHE_TTL_MS });
  return state;
}

export function invalidateWorkspaceCache(workspaceId: string) {
  stateCache.delete(workspaceId);
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

let mcpServer: Server | null = null;

function getOrCreateServer(userId: string): Server {
  if (!mcpServer) {
    mcpServer = new Server(
      {
        name: "thinkex",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    registerTools(mcpServer, userId);
  }
  return mcpServer;
}

function registerTools(server: Server, userId: string) {

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "list_workspaces",
          description: "List all workspaces for the authenticated user",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "list_workspace",
          description: "List all items in a workspace (or in a specific folder)",
          inputSchema: {
            type: "object",
            properties: {
              workspaceId: { type: "string", description: "Workspace ID" },
              folderId: {
                type: "string",
                description: "Optional folder ID to filter items",
              },
            },
            required: ["workspaceId"],
          },
        },
        {
          name: "get_recent",
          description: "Get the N most recently modified items in a workspace",
          inputSchema: {
            type: "object",
            properties: {
              workspaceId: { type: "string", description: "Workspace ID" },
              limit: {
                type: "number",
                description: "Number of items to return (default 5, max 20)",
              },
            },
            required: ["workspaceId"],
          },
        },
        {
          name: "search_workspace",
          description: "Search for items in a workspace using regex",
          inputSchema: {
            type: "object",
            properties: {
              workspaceId: { type: "string", description: "Workspace ID" },
              query: { type: "string", description: "Regex search pattern" },
              folderId: {
                type: "string",
                description: "Optional folder ID to filter search",
              },
              type: {
                type: "string",
                description: "Optional item type to filter search",
              },
              limit: {
                type: "number",
                description: "Number of results to return (default 5, max 10)",
              },
            },
            required: ["workspaceId", "query"],
          },
        },
        {
          name: "read_item",
          description: "Read the full content of an item (with pagination support)",
          inputSchema: {
            type: "object",
            properties: {
              workspaceId: { type: "string", description: "Workspace ID" },
              name: { type: "string", description: "Item name (fuzzy matched)" },
              lineStart: {
                type: "number",
                description: "Line number to start from (1-indexed, for text items)",
              },
              limit: {
                type: "number",
                description: "Number of lines to return (default 100, max 500)",
              },
              pageStart: {
                type: "number",
                description: "Page number to start from (1-indexed, for PDFs)",
              },
              pageEnd: {
                type: "number",
                description: "Page number to end at (for PDFs)",
              },
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
            content: [
              {
                type: "text",
                text: JSON.stringify(workspacesList, null, 2),
              },
            ],
          };
        }

        case "list_workspace": {
          const { workspaceId, folderId } = args as { workspaceId: string; folderId?: string };
          const state = await getCachedState(workspaceId);
          let items = state.items;

          if (folderId !== undefined) {
            items = items.filter((i) => i.folderId === folderId);
          }

          const itemsList = items.map((i) => ({
            name: i.name,
            type: i.type,
            folderId: i.folderId,
            lastModified: i.lastModified,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(itemsList, null, 2),
              },
            ],
          };
        }

        case "get_recent": {
          const { workspaceId, limit } = args as { workspaceId: string; limit?: number };
          const state = await getCachedState(workspaceId);
          const recentLimit = Math.min(limit ?? 5, 20);

          const recent = [...state.items]
            .filter((i) => i.lastModified)
            .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
            .slice(0, recentLimit)
            .map((i) => ({
              name: i.name,
              type: i.type,
              folderId: i.folderId,
              lastModified: i.lastModified,
            }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(recent, null, 2),
              },
            ],
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
          const state = await getCachedState(workspaceId);
          let items = state.items;

          if (folderId !== undefined) {
            items = items.filter((i) => i.folderId === folderId);
          }
          if (type !== undefined) {
            items = items.filter((i) => i.type === type);
          }

          let regex: RegExp;
          try {
            regex = new RegExp(query, "gi");
          } catch {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ error: "Invalid regex pattern" }, null, 2),
                },
              ],
              isError: true,
            };
          }

          const matches: Array<{
            itemName: string;
            itemType: string;
            folderId?: string;
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
                  folderId: item.folderId,
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
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      results: [],
                      suggestion:
                        "No matches found. Try list_workspace() to browse available items or broaden your query.",
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const resultLimit = Math.min(limit ?? 5, 10);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(matches.slice(0, resultLimit), null, 2),
              },
            ],
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
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      error: "Item not found. Try list_workspace() to see available items.",
                    },
                    null,
                    2
                  ),
                },
              ],
              isError: true,
            };
          }

          if (matchedItem.type === "pdf") {
            const pages = ((matchedItem.data as any).ocrPages ?? []) as Array<{
              markdown: string;
            }>;
            const start = (pageStart ?? 1) - 1;
            const end = (pageEnd ?? pages.length) - 1;
            const content = pages
              .slice(start, end + 1)
              .map((p) => p.markdown)
              .join("\n\n---\n\n");

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      itemName: matchedItem.name,
                      itemType: matchedItem.type,
                      content,
                      estimatedTokens: Math.ceil(content.length / 4),
                      totalPages: pages.length,
                      pageStart: start + 1,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const text = extractText(matchedItem);
          if (!text) {
            const url = (matchedItem.data as any).url;
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      content: null,
                      note: `This item has no stored body text. URL: ${url ?? "N/A"}`,
                    },
                    null,
                    2
                  ),
                },
              ],
            };
          }

          const lines = text.split("\n");
          const start = (lineStart ?? 1) - 1;
          const lineLimit = Math.min(limit ?? 100, 500);
          const slice = lines.slice(start, start + lineLimit);
          const content = slice.join("\n");

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    itemName: matchedItem.name,
                    itemType: matchedItem.type,
                    content,
                    estimatedTokens: Math.ceil(content.length / 4),
                    totalLines: lines.length,
                    lineStart: start + 1,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: `Unknown tool: ${name}` }, null, 2),
              },
            ],
            isError: true,
          };
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { error: error.message || "Internal server error" },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  });
}

async function handleMCP(req: NextRequest) {
  const userId = await authenticateRequest(req);

  if (!userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const server = getOrCreateServer(userId);

  if (req.method !== "POST") {
    return NextResponse.json(
      { error: "Only POST method is supported for MCP" },
      { status: 405 }
    );
  }

  try {
    const body = await req.json();
    
    const { method, params, id } = body;

    if (method === "tools/list") {
      const response = await server.request({ method: "tools/list", params }, ListToolsRequestSchema);
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: response,
      });
    } else if (method === "tools/call") {
      const response = await server.request({ method: "tools/call", params }, CallToolRequestSchema);
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: response,
      });
    } else {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`,
        },
      });
    }
  } catch (error: any) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32603,
        message: error.message || "Internal error",
      },
    }, { status: 500 });
  }
}

export const POST = handleMCP;
