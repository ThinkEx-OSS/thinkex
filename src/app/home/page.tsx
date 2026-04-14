import { HomeShell } from "@/components/home/HomeShell";
import type { InitialAuth } from "@/components/home/HomeShell";
import { auth } from "@/lib/auth";
import { listWorkspacesForUser } from "@/lib/workspace/list-workspaces";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let showDemoVideo = true;
  let initialAuth: InitialAuth = {
    isAnonymous: true,
    userName: null,
    userImage: null,
  };
  let initialWorkspaces: Awaited<
    ReturnType<typeof listWorkspacesForUser>
  > | null = null;

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (session?.user.isAnonymous) {
      const workspaceList = await listWorkspacesForUser(session.user.id);
      showDemoVideo = workspaceList.length === 0;
      initialWorkspaces = workspaceList;
    } else if (session) {
      showDemoVideo = false;
      initialAuth = {
        isAnonymous: false,
        userName: session.user.name || null,
        userImage: session.user.image || null,
      };
      try {
        const workspaceList = await listWorkspacesForUser(session.user.id);
        initialWorkspaces = workspaceList;
      } catch (error) {
        console.error("[home] Failed to fetch workspaces:", error);
      }
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
