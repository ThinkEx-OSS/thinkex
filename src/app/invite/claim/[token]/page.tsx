import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
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
    } else {
      const [existing] = await db
        .select()
        .from(workspaceCollaborators)
        .where(
          and(
            eq(workspaceCollaborators.workspaceId, emailInvite.workspaceId),
            eq(workspaceCollaborators.userId, session.user.id),
          ),
        )
        .limit(1);

      if (!existing) {
        await db.insert(workspaceCollaborators).values({
          workspaceId: emailInvite.workspaceId,
          userId: session.user.id,
          permissionLevel: emailInvite.permissionLevel,
        });
      }

      await db
        .delete(workspaceInvites)
        .where(eq(workspaceInvites.id, emailInvite.id));

      const [workspace] = await db
        .select({ slug: workspaces.slug })
        .from(workspaces)
        .where(eq(workspaces.id, emailInvite.workspaceId))
        .limit(1);

      workspaceSlug = workspace?.slug ?? null;

      if (!workspaceSlug) {
        error = "workspace-deleted";
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
        const [existing] = await db
          .select()
          .from(workspaceCollaborators)
          .where(
            and(
              eq(workspaceCollaborators.workspaceId, shareLink.workspaceId),
              eq(workspaceCollaborators.userId, session.user.id),
            ),
          )
          .limit(1);

        if (!existing) {
          await db.insert(workspaceCollaborators).values({
            workspaceId: shareLink.workspaceId,
            userId: session.user.id,
            permissionLevel: shareLink.permissionLevel,
          });
        }

        const [workspace] = await db
          .select({ slug: workspaces.slug })
          .from(workspaces)
          .where(eq(workspaces.id, shareLink.workspaceId))
          .limit(1);

        workspaceSlug = workspace?.slug ?? null;

        if (!workspaceSlug) {
          error = "workspace-deleted";
        }
      }
    } else {
      error = "not-found";
    }
  }

  if (workspaceSlug && !error) {
    redirect(`/workspace/${workspaceSlug}`);
  }

  return <InviteErrorPage error={error ?? "not-found"} />;
}
