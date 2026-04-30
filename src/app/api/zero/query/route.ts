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

function extractWorkspaceIdArg(
  args: ReadonlyJSONValue | undefined,
): string | null {
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

/**
 * Returns the workspaceId a query needs access to, or null to deny.
 * Switch (not lookup table) keeps the dispatch bounded for CodeQL.
 * New queries must be added here explicitly.
 */
function getRequiredWorkspaceId(
  name: string,
  args: ReadonlyJSONValue | undefined,
): string | null {
  switch (name) {
    case "workspace.items":
      return extractWorkspaceIdArg(args);
    default:
      return null;
  }
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

  // Body shape: `[tag, [{ id, name, args: [arg0, ...] }, ...]]`.
  // Authz throws happen per-query inside the callback so a single denied
  // workspace doesn't poison the whole batch.
  const queryRequests =
    Array.isArray(body) && body.length > 1 && Array.isArray(body[1])
      ? (body[1] as QueryRequest[])
      : [];

  const requestedWorkspaceIds = [
    ...new Set(
      queryRequests.flatMap((req) => {
        const name = typeof req?.name === "string" ? req.name : "";
        const id = getRequiredWorkspaceId(name, req?.args as ReadonlyJSONValue);
        return id ? [id] : [];
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
    console.warn("[zero/query] Denied workspace access", {
      requested: requestedWorkspaceIds.length,
      denied: deniedCount,
    });
  }

  try {
    const result = await handleQueryRequest(
      (name, args) => {
        const workspaceId = getRequiredWorkspaceId(name, args);
        if (!workspaceId || !allowedWorkspaceIds.has(workspaceId)) {
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
