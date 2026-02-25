import { AuthPageBackground } from "@/components/auth/AuthPageBackground";
import { SignInForm, SignUpForm } from "@/components/auth/AuthForms";
import { db } from "@/lib/db/client";
import { workspaceInvites, workspaces, user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const dynamicParams = false;

export function generateStaticParams() {
  return [
    { path: "sign-in" },
    { path: "sign-up" },
  ];
}

export default async function AuthPage({
  params,
  searchParams
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<{ redirect_url?: string; callbackUrl?: string; invite?: string }>;
}) {
  const { path } = await params;
  const { redirect_url, callbackUrl, invite: inviteToken } = await searchParams;

  let redirectTo = redirect_url || callbackUrl;

  // For sign-up, always route through onboarding, but preserve the final destination
  if (path === "sign-up") {
    if (redirectTo) {
      redirectTo = `/onboarding?redirect_url=${encodeURIComponent(redirectTo)}`;
    } else {
      redirectTo = "/onboarding";
    }
  } else if (!redirectTo) {
    // For sign-in without a specific target, go to home
    redirectTo = "/home";
  }

  let title = path === "sign-in" ? "Welcome back" : "Create an account";

  let description = path === "sign-in"
    ? "Sign in with your Google account to continue"
    : "Sign up with your Google account to get started";

  // Handle Invite Context
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

        title = `You've been invited!`;
        description = `${inviterName} has invited you to join ${workspaceName}. ${path === "sign-in" ? "Login" : "Create an account"} to accept.`;
      }
    } catch (e) {
      console.error("Failed to fetch invite details for auth page:", e);
    }
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
      {/* Background with grid and cards */}
      <AuthPageBackground />

      {/* Auth content */}
      <div className="relative z-10 w-full max-w-sm flex flex-col items-center">
        {/* <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-center mb-6 text-foreground">
          {title}
        </h1> */}

        <div className="w-full flex justify-center">
          <div className="w-full bg-background/60 backdrop-blur-md border border-blue-500/20 shadow-xl rounded-xl p-6 md:p-8">
            {path === "sign-in" && <SignInForm redirectTo={redirectTo} title={title} description={description} />}
            {path === "sign-up" && <SignUpForm redirectTo={redirectTo} title={title} description={description} />}
          </div>
        </div>
      </div>
    </main>
  );
}


