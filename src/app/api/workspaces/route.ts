import { NextRequest, NextResponse } from "next/server";
import { getTemplateInitialItems } from "@/lib/workspace/templates";
import { generateSlug } from "@/lib/workspace/slug";
import type { WorkspaceTemplate } from "@/lib/workspace-state/types";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";
import { createEvent } from "@/lib/workspace/events";
import { db, workspaces } from "@/lib/db/client";
import { desc, eq } from "drizzle-orm";
import {
  requireAuth,
  requireAuthWithUserInfo,
  withErrorHandling,
} from "@/lib/api/workspace-helpers";
import { appendWorkspaceEventOrThrow } from "@/lib/workspace/workspace-event-store";
import { workspaceItemProjectionState } from "@/lib/db/schema";
import { listWorkspacesForUser } from "@/lib/workspace/list-workspaces";

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
  // Use requireAuthWithUserInfo to avoid duplicate session fetch
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

  // Use the provided template, defaulting to "blank"
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

  // Get max sort_order for this user to set new workspace at the end
  const maxSortData = await db
    .select({ sortOrder: workspaces.sortOrder })
    .from(workspaces)
    .where(eq(workspaces.userId, userId))
    .orderBy(desc(workspaces.sortOrder))
    .limit(1);

  const maxSortOrder = maxSortData[0]?.sortOrder ?? -1;
  const newSortOrder = maxSortOrder + 1;

  // Create workspace with retry logic for slug collisions
  let workspace;
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  while (attempts < MAX_ATTEMPTS) {
    try {
      // Generate slug
      const slug = generateSlug(name);

      [workspace] = await db
        .insert(workspaces)
        .values({
          userId: userId,
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

      break; // Success
    } catch (error: any) {
      // Postgres unique constraint violation code is 23505
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

  if (initialItems.length > 0) {
    await db
      .insert(workspaceItemProjectionState)
      .values({
        workspaceId: workspace.id,
        lastAppliedVersion: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoNothing();

    const event = createEvent(
      "BULK_ITEMS_CREATED",
      { items: initialItems },
      userId,
      user.name || user.email || undefined,
    );

    try {
      await appendWorkspaceEventOrThrow({
        workspaceId: workspace.id,
        event,
        baseVersion: 0,
      });
    } catch (eventError) {
      await db.delete(workspaces).where(eq(workspaces.id, workspace.id));
      throw eventError;
    }
  } else {
    await db
      .insert(workspaceItemProjectionState)
      .values({
        workspaceId: workspace.id,
        lastAppliedVersion: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
  }

  // Return workspace with full state for immediate use
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
