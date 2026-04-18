import { NextRequest, NextResponse } from "next/server";
import { mustGetQuery, type ReadonlyJSONValue } from "@rocicorp/zero";
import { handleQueryRequest } from "@rocicorp/zero/server";
import { and, eq } from "drizzle-orm";
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

async function hasWorkspaceReadAccess(
  workspaceId: string,
  userId: string,
): Promise<boolean> {
  const [workspace] = await db
    .select({ ownerId: workspaces.userId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace) {
    return false;
  }

  if (workspace.ownerId === userId) {
    return true;
  }

  const [collaborator] = await db
    .select({ id: workspaceCollaborators.id })
    .from(workspaceCollaborators)
    .where(
      and(
        eq(workspaceCollaborators.workspaceId, workspaceId),
        eq(workspaceCollaborators.userId, userId),
      ),
    )
    .limit(1);

  return !!collaborator;
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const ctx = { userId };

  try {
    /**
     * `handleQueryRequest` calls the `TransformQueryFunction` callback
     * synchronously, so we cannot do async workspace access checks inside that
     * callback. We must extract workspace IDs up front and verify access before
     * handing the request to Zero.
     *
     * Zero query request bodies are encoded as:
     * `[tag, [{ id, name, args: [arg0, ...] }, ...]]`.
     */
    const body = (await request.json()) as unknown;
    const queryRequests =
      Array.isArray(body) && body.length > 1 && Array.isArray(body[1])
        ? (body[1] as QueryRequest[])
        : [];

    if (queryRequests.length === 0) {
      console.warn(
        "Zero query request body did not match expected protocol format",
        { body },
      );
    }

    const workspaceIds = [
      ...new Set(
        queryRequests.flatMap((queryRequest) => {
          if (!queryRequest || typeof queryRequest !== "object") {
            return [];
          }

          const args = Array.isArray(queryRequest.args)
            ? queryRequest.args
            : [];
          const firstArg = args?.[0];

          if (
            firstArg &&
            typeof firstArg === "object" &&
            "workspaceId" in firstArg &&
            typeof firstArg.workspaceId === "string"
          ) {
            return [firstArg.workspaceId];
          }

          if (args.length > 0) {
            console.warn("Zero query request args missing workspaceId", {
              queryRequest,
            });
          }

          return [];
        }),
      ),
    ];

    if (workspaceIds.length === 0) {
      return NextResponse.json(
        { error: "No workspace context provided" },
        { status: 400 },
      );
    }

    for (const workspaceId of workspaceIds) {
      const hasAccess = await hasWorkspaceReadAccess(workspaceId, userId);
      if (!hasAccess) {
        throw new Error(WORKSPACE_ACCESS_DENIED_ERROR);
      }
    }

    const result = await handleQueryRequest(
      (name, args) => mustGetQuery(queries, name).fn({ args, ctx }),
      schema,
      body as ReadonlyJSONValue,
    );

    return NextResponse.json(result);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === WORKSPACE_ACCESS_DENIED_ERROR
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
