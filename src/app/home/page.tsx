import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db, workspaces } from "@/lib/db/client";
import { eq, count } from "drizzle-orm";
import { HomeShell } from "@/components/home/HomeShell";

export default async function HomePage() {
  let showDemoVideo = true;

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (session) {
      if (session.user.isAnonymous) {
        const [result] = await db
          .select({ count: count() })
          .from(workspaces)
          .where(eq(workspaces.userId, session.user.id));
        showDemoVideo = (result?.count ?? 0) === 0;
      } else {
        showDemoVideo = false;
      }
    }
  } catch (error) {
    console.error("[home] Failed to check session:", error);
  }

  return <HomeShell showDemoVideo={showDemoVideo} />;
}
