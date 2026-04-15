import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db/client";
import {
  workspaceCollaborators,
  workspaceInvites,
  workspaceShareLinks,
  workspaces,
} from "@/lib/db/schema";
import InviteErrorPage from "./InviteErrorPage";

export const dynamic = "force-dynamic";

async function claimAndResolveSlug(params: {
  workspaceId: string;
  userId: string;
  permissionLevel: string;
}): Promise<{ slug: string | null }> {
  await db
    .insert(workspaceCollaborators)
    .values({
      workspaceId: params.workspaceId,
      userId: params.userId,
      permissionLevel: params.permissionLevel,
    })
    .onConflictDoNothing({
      target: [
        workspaceCollaborators.workspaceId,
        workspaceCollaborators.userId,
      ],
    });

  const [workspace] = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.id, params.workspaceId))
    .limit(1);

  return { slug: workspace?.slug ?? null };
}

export default async function InviteClaimPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!token) {
    redirect("/home");
  }

  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || session.user.isAnonymous) {
    const claimUrl = `/invite/claim/${token}`;
    redirect(
      `/auth/sign-up?invite=${token}&redirect_url=${encodeURIComponent(claimUrl)}`,
    );
  }

  let workspaceSlug: string | null = null;
  let invitedEmail: string | null = null;
  let error:
    | "expired"
    | "not-found"
    | "email-mismatch"
    | "workspace-deleted"
    | null = null;

  const [emailInvite] = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.token, token))
    .limit(1);

  if (emailInvite) {
    if (new Date(emailInvite.expiresAt) < new Date()) {
      error = "expired";
    } else if (
      !session.user.email ||
      emailInvite.email.toLowerCase() !== session.user.email.toLowerCase()
    ) {
      error = "email-mismatch";
      invitedEmail = emailInvite.email;
    } else {
      const { slug } = await claimAndResolveSlug({
        workspaceId: emailInvite.workspaceId,
        userId: session.user.id,
        permissionLevel: emailInvite.permissionLevel,
      });

      if (!slug) {
        error = "workspace-deleted";
      } else {
        await db
          .delete(workspaceInvites)
          .where(eq(workspaceInvites.id, emailInvite.id));

        workspaceSlug = slug;
      }
    }
  }

  if (!emailInvite && !error) {
    const [shareLink] = await db
      .select()
      .from(workspaceShareLinks)
      .where(eq(workspaceShareLinks.token, token))
      .limit(1);

    if (shareLink) {
      if (new Date(shareLink.expiresAt) < new Date()) {
        error = "expired";
      } else {
        const { slug } = await claimAndResolveSlug({
          workspaceId: shareLink.workspaceId,
          userId: session.user.id,
          permissionLevel: shareLink.permissionLevel,
        });

        if (!slug) {
          error = "workspace-deleted";
        } else {
          workspaceSlug = slug;
        }
      }
    } else {
      error = "not-found";
    }
  }

  if (workspaceSlug && !error) {
    redirect(`/workspace/${workspaceSlug}`);
  }

  return (
    <InviteErrorPage error={error ?? "not-found"} invitedEmail={invitedEmail} />
  );
}
