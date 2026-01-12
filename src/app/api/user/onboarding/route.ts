import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, userProfiles, workspaces } from "@/lib/db/client";
import { cloneDemoWorkspace } from "@/lib/workspace/clone-demo";
import { eq } from "drizzle-orm";

/**
 * GET /api/user/onboarding
 * Get the current user's onboarding status
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Try to get existing profile
    let profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    let redirectTo: string | undefined;

    // If no profile exists, create one and seed a default workspace
    if (!profile[0]) {
      const [newProfile] = await db
        .insert(userProfiles)
        .values({
          userId: userId,
          onboardingCompleted: false,
        })
        .returning();

      profile = [newProfile];

      try {
        // Check if user already has workspaces (e.g., from anonymous session linking)
        const existingWorkspaces = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.userId, userId))
          .limit(1);

        if (existingWorkspaces.length > 0) {
          // User already has a workspace, use that
          redirectTo = `/dashboard/${existingWorkspaces[0].slug}`;
        } else {
          // Clone demo workspace using shared utility
          const userName = session.user.name || session.user.email || undefined;
          const result = await cloneDemoWorkspace(userId, userName);
          redirectTo = `/dashboard/${result.slug}`;
        }

        // Mark onboarding as completed after successfully creating the workspace
        const [updatedProfile] = await db
          .update(userProfiles)
          .set({
            onboardingCompleted: true,
            onboardingCompletedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          .where(eq(userProfiles.userId, userId))
          .returning();

        // Update the profile reference for the response
        if (updatedProfile) {
          profile = [updatedProfile];
        }
      } catch (workspaceError) {
        console.error("Error creating default workspace for new user:", workspaceError);
      }
    }

    return NextResponse.json({
      profile: profile[0],
      shouldShowOnboarding: !profile[0].onboardingCompleted,
      redirectTo,
    });
  } catch (error) {
    console.error('Error fetching onboarding status:', error);
    return NextResponse.json(
      { error: "Failed to fetch onboarding status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/onboarding
 * Mark onboarding as completed or toggle status (dev mode only)
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json().catch(() => ({}));
    const { toggle } = body;

    // Only allow toggle in development mode
    if (toggle && process.env.NODE_ENV !== "development") {
      return NextResponse.json(
        { error: "Toggle only available in development" },
        { status: 403 }
      );
    }

    // Get current profile
    const currentProfile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (!currentProfile[0]) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const currentStatus = currentProfile[0].onboardingCompleted;
    const newStatus = toggle ? !currentStatus : true;

    const [updatedProfile] = await db
      .update(userProfiles)
      .set({
        onboardingCompleted: newStatus,
        onboardingCompletedAt: newStatus ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(userProfiles.userId, userId))
      .returning();

    return NextResponse.json({ profile: updatedProfile });
  } catch (error) {
    console.error('Error updating onboarding status:', error);
    return NextResponse.json(
      { error: "Failed to update onboarding status" },
      { status: 500 }
    );
  }
}
