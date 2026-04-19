import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces } from "@/lib/db/client";
import { workspaceCollaborators } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { loadWorkspaceState } from "@/lib/workspace/workspace-state-read";
import { hasDuplicateName } from "@/lib/workspace/unique-name";
import { normalizeWorkspaceItems } from "@/lib/workspace-state/state";
import type { Item } from "@/lib/workspace-state/types";

export interface MutationIdentity {
  userId: string;
  userName?: string;
}

/**
 * Resolve authenticated user for server-side mutation contexts (API routes,
 * workers, workflows). Returns userId and displayName from the session.
 */
export async function requireMutationIdentity(): Promise<MutationIdentity> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    throw new Error("User not authenticated");
  }
  return {
    userId: session.user.id,
    userName: session.user.name || session.user.email || undefined,
  };
}

/**
 * Verify the caller has editor-level access to a workspace (owner or editor
 * collaborator). Throws on missing workspace or insufficient permissions.
 */
export async function requireWorkspaceEditor(
  workspaceId: string,
  userId: string,
): Promise<void> {
  const workspace = await db
    .select({ userId: workspaces.userId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace[0]) {
    throw new Error("Workspace not found");
  }

  if (workspace[0].userId === userId) return;

  const [collaborator] = await db
    .select({ permissionLevel: workspaceCollaborators.permissionLevel })
    .from(workspaceCollaborators)
    .where(
      and(
        eq(workspaceCollaborators.workspaceId, workspaceId),
        eq(workspaceCollaborators.userId, userId),
      ),
    )
    .limit(1);

  if (!collaborator || collaborator.permissionLevel !== "editor") {
    throw new Error("Access denied - editor permission required");
  }
}

/**
 * Load workspace items for invariant checks (normalized).
 */
export async function loadWorkspaceItemsForValidation(
  workspaceId: string,
  userId: string,
): Promise<Item[]> {
  return normalizeWorkspaceItems(
    await loadWorkspaceState(workspaceId, { userId }),
  );
}

/**
 * Assert that no sibling item shares the same name + type in the given folder.
 * Returns the error message if a duplicate exists, or null if the name is available.
 */
export function checkDuplicateName(
  items: Item[],
  name: string,
  type: Item["type"],
  folderId: string | null,
  excludeItemId?: string,
): string | null {
  if (hasDuplicateName(items, name, type, folderId, excludeItemId)) {
    return `A ${type} named "${name}" already exists in this folder`;
  }
  return null;
}
