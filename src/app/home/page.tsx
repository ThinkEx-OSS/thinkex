import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces } from "@/lib/db/client";
import { eq, count } from "drizzle-orm";
import { HomeShell } from "@/components/home/HomeShell";
import type { InitialAuth } from "@/components/home/HomeShell";

export default async function HomePage() {
  let showDemoVideo = false;
  let initialAuth: InitialAuth = {
    isAnonymous: true,
    userName: null,
    userImage: null,
  };
  let initialWorkspaces: any[] | null = null;

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session) {
      showDemoVideo = true;
    } else if (session.user.isAnonymous) {
      const [result] = await db
        .select({ count: count() })
        .from(workspaces)
        .where(eq(workspaces.userId, session.user.id));
      showDemoVideo = (result?.count ?? 0) === 0;

      if (!showDemoVideo) {
        const userWorkspaces = await db
          .select()
          .from(workspaces)
          .where(eq(workspaces.userId, session.user.id));
        initialWorkspaces = userWorkspaces;
      }
    } else {
      initialAuth = {
        isAnonymous: false,
        userName: session.user.name || null,
        userImage: session.user.image || null,
      };
      const userWorkspaces = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.userId, session.user.id));
      initialWorkspaces = userWorkspaces;
    }
  } catch (error) {
    console.error("[home] Failed to check session:", error);
  }

  return (
    <HomeShell
      showDemoVideo={showDemoVideo}
      initialAuth={initialAuth}
      initialWorkspaces={initialWorkspaces}
    />
  );
}
