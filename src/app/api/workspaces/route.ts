import { NextRequest, NextResponse } from "next/server";
import { getTemplateInitialItems } from "@/lib/workspace/templates";
import { generateSlug } from "@/lib/workspace/slug";
import type { WorkspaceTemplate } from "@/lib/workspace-state/types";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";
import { db, workspaces } from "@/lib/db/client";
import { desc, eq } from "drizzle-orm";
import {
  requireAuth,
  requireAuthWithUserInfo,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import { listWorkspacesForUser } from "@/lib/workspace/list-workspaces";
import { insertWorkspaceItem } from "@/lib/workspace/workspace-item-write";

/**
 * GET /api/workspaces
 * List all workspaces for the authenticated user (owned + shared)
 */
async function handleGET() {
  const userId = await requireAuth();
  const workspaceList = await listWorkspacesForUser(userId);
  return NextResponse.json({ workspaces: workspaceList });
}

export const GET = withErrorHandling(handleGET, "GET /api/workspaces");

/**
 * POST /api/workspaces
 * Create a new workspace
 */
async function handlePOST(request: NextRequest) {
  const user = await requireAuthWithUserInfo();
  const userId = user.userId;

  const body = await request.json();
  const {
    name,
    description,
    template,
    is_public,
    icon,
    color,
    initialItems: customInitialItems,
  } = body;

  const effectiveTemplate: WorkspaceTemplate =
    template && ["blank", "getting_started"].includes(template)
      ? template
      : "blank";

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json(
      { error: "Name is required and must be a string" },
      { status: 400 },
    );
  }

  const maxSortData = await db
    .select({ sortOrder: workspaces.sortOrder })
    .from(workspaces)
    .where(eq(workspaces.userId, userId))
    .orderBy(desc(workspaces.sortOrder))
    .limit(1);

  const maxSortOrder = maxSortData[0]?.sortOrder ?? -1;
  const newSortOrder = maxSortOrder + 1;

  let workspace;
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  while (attempts < MAX_ATTEMPTS) {
    try {
      const slug = generateSlug(name);

      [workspace] = await db
        .insert(workspaces)
        .values({
          userId,
          name,
          description: description || "",
          template: effectiveTemplate,
          isPublic: is_public || false,
          icon: icon || null,
          color: color || null,
          sortOrder: newSortOrder,
          slug,
        })
        .returning();

      break;
    } catch (error: any) {
      if (error?.code === "23505") {
        attempts++;
        if (attempts === MAX_ATTEMPTS) throw error;
        continue;
      }
      throw error;
    }
  }

  if (!workspace) {
    throw new Error("Failed to create workspace after multiple attempts");
  }

  const initialItems = customInitialItems
    ? normalizeWorkspaceItems(customInitialItems)
    : getTemplateInitialItems(effectiveTemplate);

  try {
    await db.transaction(async (tx) => {
      for (const item of initialItems) {
        await insertWorkspaceItem(tx, {
          workspaceId: workspace.id,
          item,
          sourceVersion: 0,
        });
      }
    });
  } catch (insertError) {
    await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
    throw insertError;
  }

  return NextResponse.json(
    {
      workspace: {
        ...workspace,
        state: initialItems,
      },
    },
    { status: 201 },
  );
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces");
