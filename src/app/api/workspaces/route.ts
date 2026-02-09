import { NextRequest, NextResponse } from "next/server";
import { getTemplateInitialState } from "@/lib/workspace/templates";
import { generateSlug } from "@/lib/workspace/slug";
import type { WorkspaceWithState, WorkspaceTemplate } from "@/lib/workspace-state/types";
import type { CardColor } from "@/lib/workspace-state/colors";
import { randomUUID } from "crypto";
import { db, workspaces } from "@/lib/db/client";
import { workspaceCollaborators } from "@/lib/db/schema";
import { eq, desc, asc, sql, inArray } from "drizzle-orm";
import { requireAuth, requireAuthWithUserInfo, withErrorHandling } from "@/lib/api/workspace-helpers";

/**
 * GET /api/workspaces
 * List all workspaces for the authenticated user (owned + shared)
 */
async function handleGET() {
  const userId = await requireAuth();

  // Get workspaces owned by user
  const ownedWorkspaces = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.userId, userId));

  // Get workspaces user is a collaborator on
  const collaborations = await db
    .select({
      workspaceId: workspaceCollaborators.workspaceId,
      permissionLevel: workspaceCollaborators.permissionLevel,
      lastOpenedAt: workspaceCollaborators.lastOpenedAt
    })
    .from(workspaceCollaborators)
    .where(eq(workspaceCollaborators.userId, userId));

  let sharedWorkspaces: typeof ownedWorkspaces = [];
  if (collaborations.length > 0) {
    const sharedWorkspaceIds = collaborations.map(c => c.workspaceId);
    sharedWorkspaces = await db
      .select()
      .from(workspaces)
      .where(inArray(workspaces.id, sharedWorkspaceIds)); // No sort here, we sort in JS
  }

  // Create a map of permission levels and lastOpened for shared workspaces
  const collaborationMap = new Map(collaborations.map(c => [c.workspaceId, c]));

  // Format owned workspaces
  const ownedList = ownedWorkspaces.map((w) => ({
    id: w.id,
    userId: w.userId,
    name: w.name,
    description: w.description || '',
    template: (w.template as WorkspaceTemplate) || 'blank',
    isPublic: w.isPublic || false,
    createdAt: w.createdAt || '',
    updatedAt: w.updatedAt || '',
    slug: w.slug || '',
    icon: w.icon,
    sortOrder: w.sortOrder ?? null,
    color: w.color as CardColor | null,
    lastOpenedAt: w.lastOpenedAt ?? null, // Owner uses workspace field
    isShared: false,
  }));

  // Format shared workspaces
  const sharedList = sharedWorkspaces.map((w) => {
    const collaboration = collaborationMap.get(w.id);
    return {
      id: w.id,
      userId: w.userId,
      name: w.name,
      description: w.description || '',
      template: (w.template as WorkspaceTemplate) || 'blank',
      isPublic: w.isPublic || false,
      createdAt: w.createdAt || '',
      updatedAt: w.updatedAt || '',
      slug: w.slug || '',
      icon: w.icon,
      sortOrder: w.sortOrder ?? null,
      color: w.color as CardColor | null,
      lastOpenedAt: collaboration?.lastOpenedAt ?? null, // Collaborator uses junction field
      isShared: true,
      permissionLevel: collaboration?.permissionLevel || 'viewer',
      sharedAt: (collaboration as any)?.createdAt || null, // Use createdAt from collaborator record if available
    };
  });

  // Merge lists (filtering out shared workspaces that are also owned)
  const ownedIds = new Set(ownedList.map(w => w.id));
  const uniqueSharedList = sharedList.filter(w => !ownedIds.has(w.id));
  const workspaceList = [...ownedList, ...uniqueSharedList];

  // Sort by unseen shared first, then lastOpenedAt DESC, then sortOrder ASC, then updatedAt DESC
  workspaceList.sort((a, b) => {
    // 0. Unseen shared workspaces (isShared=true, lastOpenedAt=null) go to TOP
    // Sort these by sharedAt DESC (newest shared first)
    const aIsUnseenShared = a.isShared && !a.lastOpenedAt;
    const bIsUnseenShared = b.isShared && !b.lastOpenedAt;

    if (aIsUnseenShared && bIsUnseenShared) {
      // Both unseen: sort by sharedAt if available, otherwise fallback to updatedAt
      const sharedA = (a as any).sharedAt ? new Date((a as any).sharedAt).getTime() : 0;
      const sharedB = (b as any).sharedAt ? new Date((b as any).sharedAt).getTime() : 0;
      if (sharedA !== sharedB) return sharedB - sharedA;
      // Fallback to update time if sharedAt is missing/same
      const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return dateB - dateA;
    }
    if (aIsUnseenShared) return -1; // a goes first
    if (bIsUnseenShared) return 1;  // b goes first

    // 1. lastOpenedAt DESC (most recent first)
    if (a.lastOpenedAt && b.lastOpenedAt) {
      return new Date(b.lastOpenedAt).getTime() - new Date(a.lastOpenedAt).getTime();
    }
    if (a.lastOpenedAt) return -1; // a has date, goes first
    if (b.lastOpenedAt) return 1;  // b has date, goes first

    // 2. sortOrder ASC (nulls last)
    if (a.sortOrder !== null && b.sortOrder !== null) {
      return a.sortOrder - b.sortOrder;
    }
    if (a.sortOrder !== null) return -1; // a has order, goes first
    if (b.sortOrder !== null) return 1;

    // 3. updatedAt DESC (fallback)
    const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return dateB - dateA;
  });

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
  const { name, description, template, is_public, icon, color, initialState: customInitialState } = body;

  // Use the provided template, defaulting to "blank"
  const effectiveTemplate: WorkspaceTemplate = (template && [
    "blank",
    "getting_started",
  ].includes(template))
    ? template
    : "blank";

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json({ error: "Name is required and must be a string" }, { status: 400 });
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
      if (error?.code === '23505') {
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

  // Create initial state - use custom state if provided, otherwise use template
  let initialState;
  if (customInitialState) {
    // Use provided initial state (already validated on client side)
    initialState = customInitialState;
    initialState.workspaceId = workspace.id;
    // Ensure globalTitle and globalDescription are set from workspace metadata
    if (!initialState.globalTitle) {
      initialState.globalTitle = name;
    }
    if (!initialState.globalDescription && description) {
      initialState.globalDescription = description;
    }
  } else {
    // Use template-based initial state
    initialState = getTemplateInitialState(effectiveTemplate);
    initialState.workspaceId = workspace.id;
    initialState.globalTitle = name;
    initialState.globalDescription = description || "";
  }

  // Note: No need to create workspace_states record - state is now managed via events

  // Determine if we need a WORKSPACE_SNAPSHOT (has items) or just WORKSPACE_CREATED (empty)
  const hasItems = initialState.items && initialState.items.length > 0;

  // For workspaces with items (custom or template-based), create WORKSPACE_SNAPSHOT
  // This sets the entire state in one event, including title, description, and items
  if (customInitialState || hasItems) {
    const eventId = randomUUID();
    const timestamp = Date.now();

    // Use user info from requireAuthWithUserInfo to avoid duplicate session fetch
    const userName = user.name || user.email || undefined;

    // Create snapshot event first (starts at version 0, creates version 1)
    try {
      await db.execute(sql`
          SELECT append_workspace_event(
            ${workspace.id}::uuid,
            ${eventId}::text,
            ${'WORKSPACE_SNAPSHOT'}::text,
            ${JSON.stringify(initialState)}::jsonb,
            ${timestamp}::bigint,
            ${userId}::text,
            ${0}::integer,
            ${userName || null}::text
          )
        `);

      // If snapshot creation succeeded, we're done (it includes title/description)
      // No need for separate WORKSPACE_CREATED event
    } catch (eventError) {
      console.error("Error creating WORKSPACE_SNAPSHOT event:", eventError);
      // If snapshot fails, create WORKSPACE_CREATED as fallback
      try {
        const createdEventId = randomUUID();
        const createdTimestamp = Date.now();
        await db.execute(sql`
            SELECT append_workspace_event(
              ${workspace.id}::uuid,
              ${createdEventId}::text,
              ${'WORKSPACE_CREATED'}::text,
              ${JSON.stringify({ title: name, description: description || "" })}::jsonb,
              ${createdTimestamp}::bigint,
              ${userId}::text,
              ${0}::integer,
              ${null}::text
            )
          `);
      } catch (createdError) {
        console.error("Error creating WORKSPACE_CREATED event:", createdError);
      }
    }
  } else {
    // For empty workspaces, just create WORKSPACE_CREATED event
    try {
      const eventId = randomUUID();
      const timestamp = Date.now();

      await db.execute(sql`
          SELECT append_workspace_event(
            ${workspace.id}::uuid,
            ${eventId}::text,
            ${'WORKSPACE_CREATED'}::text,
            ${JSON.stringify({ title: name, description: description || "" })}::jsonb,
            ${timestamp}::bigint,
            ${userId}::text,
            ${0}::integer,
            ${null}::text
          )
        `);
    } catch (eventError) {
      // If event creation fails, continue – workspace exists in DB,
      // but event-sourced title/description may be missing
      console.error("Error creating WORKSPACE_CREATED event:", eventError);
    }
  }

  // Return workspace with full state for immediate use
  return NextResponse.json({
    workspace: {
      ...workspace,
      state: initialState,
    }
  }, { status: 201 });
}

export const POST = withErrorHandling(handlePOST, "POST /api/workspaces");
