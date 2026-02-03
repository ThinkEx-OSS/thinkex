import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces } from "@/lib/db/client";
import { workspaceCollaborators } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Get authenticated user from session
 * Returns userId, name, and email or null if not authenticated
 */
export async function getAuthenticatedUser(): Promise<{ userId: string; name?: string; email?: string } | null> {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  return {
    userId: session.user.id,
    name: session.user.name ?? undefined,
    email: session.user.email ?? undefined,
  };
}

/**
 * Verify workspace ownership and return workspace data
 * Throws NextResponse errors for unauthorized/not found cases
 */
export async function verifyWorkspaceOwnership(
  workspaceId: string,
  userId: string
): Promise<{ userId: string }> {
  const workspace = await db
    .select({ userId: workspaces.userId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace[0]) {
    throw NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (workspace[0].userId !== userId) {
    throw NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return workspace[0];
}

/**
 * Verify workspace access (owner OR collaborator)
 * Returns access info including permission level
 * Throws NextResponse errors for unauthorized/not found cases
 */
export async function verifyWorkspaceAccess(
  workspaceId: string,
  userId: string,
  requiredPermission: 'viewer' | 'editor' = 'viewer'
): Promise<{ isOwner: boolean; permissionLevel: 'owner' | 'editor' | 'viewer' }> {
  // Check if workspace exists and get owner
  const workspace = await db
    .select({ userId: workspaces.userId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace[0]) {
    throw NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Owner has full access
  if (workspace[0].userId === userId) {
    return { isOwner: true, permissionLevel: 'owner' };
  }

  // Check if user is a collaborator
  const [collaborator] = await db
    .select({ permissionLevel: workspaceCollaborators.permissionLevel })
    .from(workspaceCollaborators)
    .where(
      and(
        eq(workspaceCollaborators.workspaceId, workspaceId),
        eq(workspaceCollaborators.userId, userId)
      )
    )
    .limit(1);

  if (!collaborator) {
    throw NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Check if user has required permission level
  const permLevel = collaborator.permissionLevel as 'editor' | 'viewer';
  if (requiredPermission === 'editor' && permLevel !== 'editor') {
    throw NextResponse.json({ error: "Editor access required" }, { status: 403 });
  }

  return { isOwner: false, permissionLevel: permLevel };
}

/**
 * Verify workspace ownership and return full workspace data
 * Throws NextResponse errors for unauthorized/not found cases
 */
export async function verifyWorkspaceOwnershipWithData(
  workspaceId: string,
  userId: string
): Promise<typeof workspaces.$inferSelect> {
  const workspace = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  if (!workspace[0]) {
    throw NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  if (workspace[0].userId !== userId) {
    throw NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  return workspace[0];
}

/**
 * Wrapper for API route handlers with error handling
 */
export function withErrorHandling<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>,
  routeName: string
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      // If error is already a Response/NextResponse, return it
      if (error instanceof Response) {
        return error as NextResponse;
      }

      console.error(`Error in ${routeName}:`, error);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

/**
 * Require authentication - returns userId or throws 401
 */
export async function requireAuth(): Promise<string> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user.userId;
}

/**
 * Require authentication with user info - returns userId, name, and email or throws 401
 * Use this when you need user name/email to avoid duplicate session fetches
 */
export async function requireAuthWithUserInfo(): Promise<{ userId: string; name?: string; email?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) {
    throw NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return user;
}
