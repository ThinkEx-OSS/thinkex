import { eq } from "drizzle-orm";
import { SignInForm, SignUpForm } from "@/components/auth/AuthForms";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";
import { db } from "@/lib/db/client";
import {
  user,
  workspaceInvites,
  workspaceShareLinks,
  workspaces,
} from "@/lib/db/schema";

export const dynamicParams = false;

export function generateStaticParams() {
  return [{ path: "sign-in" }, { path: "sign-up" }];
}

export default async function AuthPage({
  params,
  searchParams,
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<{
    redirect_url?: string;
    callbackUrl?: string;
    invite?: string;
  }>;
}) {
  const { path } = await params;
  const { redirect_url, callbackUrl, invite: inviteToken } = await searchParams;

  let redirectTo = redirect_url || callbackUrl;

  if (path === "sign-up" && !redirectTo) {
    redirectTo = "/home";
  } else if (!redirectTo) {
    redirectTo = "/home";
  }

  let title = path === "sign-in" ? "Welcome back" : "Create an account";
  let description =
    path === "sign-in"
      ? "Sign in with your Google account to continue"
      : "Sign up with your Google account to get started";

  if (inviteToken) {
    try {
      const [invite] = await db
        .select({
          workspaceId: workspaceInvites.workspaceId,
          inviterId: workspaceInvites.inviterId,
        })
        .from(workspaceInvites)
        .where(eq(workspaceInvites.token, inviteToken))
        .limit(1);

      if (invite) {
        const [workspace] = await db
          .select({ name: workspaces.name })
          .from(workspaces)
          .where(eq(workspaces.id, invite.workspaceId))
          .limit(1);

        const [inviter] = await db
          .select({ name: user.name, email: user.email })
          .from(user)
          .where(eq(user.id, invite.inviterId))
          .limit(1);

        const workspaceName = workspace?.name || "a workspace";
        const inviterName = inviter?.name || inviter?.email || "someone";

        title = "You've been invited!";
        description = `${inviterName} has invited you to join ${workspaceName}. ${path === "sign-in" ? "Login" : "Create an account"} to accept.`;
      } else {
        const [shareLink] = await db
          .select({ workspaceName: workspaces.name })
          .from(workspaceShareLinks)
          .innerJoin(
            workspaces,
            eq(workspaces.id, workspaceShareLinks.workspaceId),
          )
          .where(eq(workspaceShareLinks.token, inviteToken))
          .limit(1);

        if (shareLink) {
          const workspaceName = shareLink.workspaceName || "a workspace";
          title = "You've been invited!";
          description = `You've been invited to join ${workspaceName}. ${path === "sign-in" ? "Login" : "Create an account"} to accept.`;
        }
      }
    } catch (error) {
      console.error("Failed to fetch invite details for auth page:", error);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6 rounded-xl shadow-2xl bg-background border border-border/40 p-6 md:p-8">
        <div className="flex items-center justify-center w-fit">
          <ThinkExLogo size={32} />
        </div>

        <div className="w-full flex justify-center">
          <div className="w-full">
            {path === "sign-in" && (
              <SignInForm
                redirectTo={redirectTo}
                title={title}
                description={description}
              />
            )}
            {path === "sign-up" && (
              <SignUpForm
                redirectTo={redirectTo}
                title={title}
                description={description}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
