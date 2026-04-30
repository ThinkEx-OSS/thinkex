import { NextRequest, NextResponse } from "next/server";
import { mustGetQuery, type ReadonlyJSONValue } from "@rocicorp/zero";
import { handleQueryRequest } from "@rocicorp/zero/server";
import { and, eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { workspaceCollaborators, workspaces } from "@/lib/db/schema";
import { queries } from "@/lib/zero/queries";
import { schema } from "@/lib/zero/zero-schema.gen";

const WORKSPACE_ACCESS_DENIED_ERROR = "Workspace access denied";

type QueryRequest = {
  id?: unknown;
  name?: unknown;
  args?: readonly unknown[];
};

/**
 * Fetch the set of workspace IDs (out of `candidateIds`) that `userId` is allowed
 * to read. Done in two batched queries (owner + collaborator) so we don't fan out
 * to N round trips when Zero batches queries on the client.
 */
async function getAllowedWorkspaceIds(
  candidateIds: readonly string[],
  userId: string,
): Promise<Set<string>> {
  if (candidateIds.length === 0) {
    return new Set();
  }

  const [ownedRows, collaboratorRows] = await Promise.all([
    db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(
        and(eq(workspaces.userId, userId), inArray(workspaces.id, candidateIds)),
      ),
    db
      .select({ id: workspaceCollaborators.workspaceId })
      .from(workspaceCollaborators)
      .where(
        and(
          eq(workspaceCollaborators.userId, userId),
          inArray(workspaceCollaborators.workspaceId, candidateIds),
        ),
      ),
  ]);

  const allowed = new Set<string>();
  for (const row of ownedRows) allowed.add(row.id);
  for (const row of collaboratorRows) allowed.add(row.id);
  return allowed;
}

/**
 * Per-query workspaceId extractors. Fail-closed: a workspace-scoped query
 * must be registered here for the route to allow it. Adding a new
 * `workspace.*` query without an entry will (correctly) cause the route to
 * deny all instances of that query rather than silently bypass authz.
 */
const WORKSPACE_QUERY_EXTRACTORS: Record<
  string,
  (args: ReadonlyJSONValue | undefined) => string | null
> = {
  "workspace.items": (args) => {
    if (!Array.isArray(args)) return null;
    const first = args[0];
    if (
      first &&
      typeof first === "object" &&
      !Array.isArray(first) &&
      "workspaceId" in first &&
      typeof (first as { workspaceId?: unknown }).workspaceId === "string"
    ) {
      return (first as { workspaceId: string }).workspaceId;
    }
    return null;
  },
};

function getWorkspaceIdForQuery(
  name: string,
  args: ReadonlyJSONValue | undefined,
): { kind: "ok"; workspaceId: string } | { kind: "deny" } | { kind: "global" } {
  // Anything under `workspace.*` MUST have a registered extractor and a
  // resolvable workspaceId — otherwise we deny by default.
  if (name.startsWith("workspace.")) {
    const extractor = WORKSPACE_QUERY_EXTRACTORS[name];
    if (!extractor) return { kind: "deny" };
    const workspaceId = extractor(args);
    if (!workspaceId) return { kind: "deny" };
    return { kind: "ok", workspaceId };
  }
  // Future namespaces with no workspace context (e.g. `user.preferences`)
  // bypass workspace authz; per-query authz lives in the resolver itself.
  return { kind: "global" };
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const ctx = { userId };

  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    console.error("[zero/query] Failed to parse body:", error);
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  // Zero query request body shape: `[tag, [{ id, name, args: [arg0, ...] }, ...]]`.
  // Extract every workspaceId referenced so we can run a single batched access
  // check before letting Zero resolve queries. We must NOT throw out of the
  // outer scope on a single denied workspace — that would poison the whole
  // batch. Instead we throw per-query inside the transformQuery callback;
  // Zero turns those into per-query `app` errors and the rest of the batch
  // still resolves.
  const queryRequests =
    Array.isArray(body) && body.length > 1 && Array.isArray(body[1])
      ? (body[1] as QueryRequest[])
      : [];

  const requestedWorkspaceIds = [
    ...new Set(
      queryRequests.flatMap((req) => {
        const name = typeof req?.name === "string" ? req.name : "";
        const decision = getWorkspaceIdForQuery(
          name,
          req?.args as ReadonlyJSONValue,
        );
        return decision.kind === "ok" ? [decision.workspaceId] : [];
      }),
    ),
  ];

  let allowedWorkspaceIds = new Set<string>();
  try {
    allowedWorkspaceIds = await getAllowedWorkspaceIds(
      requestedWorkspaceIds,
      userId,
    );
  } catch (error) {
    console.error("[zero/query] Access check failed:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }

  const deniedCount = requestedWorkspaceIds.filter(
    (id) => !allowedWorkspaceIds.has(id),
  ).length;

  if (deniedCount > 0) {
    // Counts only — raw user/workspace IDs are deliberately excluded from logs.
    console.warn("[zero/query] Denied workspace access", {
      requested: requestedWorkspaceIds.length,
      denied: deniedCount,
    });
  }

  try {
    const result = await handleQueryRequest(
      (name, args) => {
        const decision = getWorkspaceIdForQuery(name, args);
        if (decision.kind === "deny") {
          throw new Error(WORKSPACE_ACCESS_DENIED_ERROR);
        }
        if (
          decision.kind === "ok" &&
          !allowedWorkspaceIds.has(decision.workspaceId)
        ) {
          // Per-query throw → Zero returns it as an `app` error for THIS query
          // only. Other queries in the same batch still resolve normally.
          throw new Error(WORKSPACE_ACCESS_DENIED_ERROR);
        }
        return mustGetQuery(queries, name).fn({ args, ctx });
      },
      schema,
      body as ReadonlyJSONValue,
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[zero/query] Unhandled error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
