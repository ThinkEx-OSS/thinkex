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

function extractWorkspaceId(args: ReadonlyJSONValue | undefined): string | null {
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
      queryRequests
        .map((req) => extractWorkspaceId(req?.args as ReadonlyJSONValue))
        .filter((id): id is string => typeof id === "string"),
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

  const deniedWorkspaceIds = requestedWorkspaceIds.filter(
    (id) => !allowedWorkspaceIds.has(id),
  );

  if (deniedWorkspaceIds.length > 0) {
    console.warn("[zero/query] Denied workspace access for user", {
      userId,
      requestedWorkspaceIds,
      deniedWorkspaceIds,
    });
  }

  try {
    const result = await handleQueryRequest(
      (name, args) => {
        const workspaceId = extractWorkspaceId(args);
        if (workspaceId && !allowedWorkspaceIds.has(workspaceId)) {
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
