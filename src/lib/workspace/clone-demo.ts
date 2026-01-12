import { db, workspaces } from "@/lib/db/client";
import { getTemplateInitialState } from "@/lib/workspace/templates";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const DEMO_WORKSPACE_ID = '511080ff-429e-4492-a242-1fc8416271d8';

export interface CloneDemoWorkspaceResult {
    workspaceId: string;
    slug: string;
}

/**
 * Clone the demo workspace for a new user.
 * This is shared between guest setup and user onboarding flows.
 * 
 * @param userId - The user ID to create the workspace for
 * @param userName - Optional user name for event attribution
 * @returns The new workspace ID and slug
 */
export async function cloneDemoWorkspace(
    userId: string,
    userName?: string
): Promise<CloneDemoWorkspaceResult> {
    // Fetch demo workspace metadata and load state in parallel
    const [demoWorkspaceData, demoState] = await Promise.all([
        db
            .select()
            .from(workspaces)
            .where(eq(workspaces.id, DEMO_WORKSPACE_ID))
            .limit(1),
        loadWorkspaceState(DEMO_WORKSPACE_ID).catch(() => null),
    ]);

    const sourceWorkspace = demoWorkspaceData[0];
    let initialState;
    let name = "New Workspace";
    let description = "";
    let icon = null;
    let color = null;

    if (sourceWorkspace && demoState) {
        // Clone from demo workspace
        name = sourceWorkspace.name;
        description = sourceWorkspace.description || "";
        icon = sourceWorkspace.icon;
        color = sourceWorkspace.color;
        initialState = demoState;

        // Ensure titles match if missing in state
        if (!initialState.globalTitle) initialState.globalTitle = name;
        if (!initialState.globalDescription) initialState.globalDescription = description;
    } else {
        // Fallback to blank if demo workspace not found or state load failed
        initialState = getTemplateInitialState("blank");
    }

    const [workspace] = await db
        .insert(workspaces)
        .values({
            userId,
            name,
            description,
            template: "blank",
            isPublic: false,
            icon,
            color,
            sortOrder: 0,
        })
        .returning();

    initialState.workspaceId = workspace.id;

    const eventId = randomUUID();
    const timestamp = Date.now();

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

    return {
        workspaceId: workspace.id,
        slug: workspace.slug || workspace.id,
    };
}
