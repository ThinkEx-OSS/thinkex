import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getTemplateInitialState } from "@/lib/workspace/templates";
import type { WorkspaceWithState, WorkspaceTemplate } from "@/lib/workspace-state/types";
import type { CardColor } from "@/lib/workspace-state/colors";
import { randomUUID } from "crypto";
import { db, workspaces } from "@/lib/db/client";
import { eq, desc, asc, sql } from "drizzle-orm";

/**
 * GET /api/workspaces
 * List all workspaces for the authenticated user
 * Note: Sharing is fork-based - users import copies, not access the original
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    // Allow anonymous users
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get workspaces owned by user
    // Order by sort_order ASC, fallback to updated_at DESC for null sort_order values
    const ownedWorkspaces = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.userId, userId))
      .orderBy(
        asc(workspaces.sortOrder),
        desc(workspaces.updatedAt)
      );

    // Format results (using camelCase for Drizzle types)
    const workspaceList: WorkspaceWithState[] = ownedWorkspaces.map((w) => ({
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
    }));

    return NextResponse.json({ workspaces: workspaceList });
  } catch (error) {
    console.error("Error in GET /api/workspaces:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/workspaces
 * Create a new workspace
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    // Allow anonymous users
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const body = await request.json();
    const { name, description, template, is_public, icon, color, initialState: customInitialState } = body;

    // Server-side safeguard: only allow blank template workspaces
    // This ensures all new workspaces start from an empty state
    const effectiveTemplate: WorkspaceTemplate = "blank";

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
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

    // Create workspace
    const [workspace] = await db
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
      })
      .returning();

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

    // For custom initial state (imported workspaces), create WORKSPACE_SNAPSHOT first
    // This sets the entire state in one event, including title and description
    if (customInitialState) {
      const eventId = randomUUID();
      const timestamp = Date.now();

      // Get user's display name from Better Auth session
      // Better Auth stores name and email in the session
      let userName: string | undefined;
      try {
        userName = session.user.name || session.user.email || undefined;
      } catch {
        // Could not get user name
        // Continue without userName
      }

      // Create snapshot event first (starts at version 0, creates version 1)
      try {
        const snapshotResult = await db.execute(sql`
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
      // For template-based workspaces, just create WORKSPACE_CREATED event
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
  } catch (error) {
    console.error("Error in POST /api/workspaces:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

