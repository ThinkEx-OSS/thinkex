import { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  user,
  workspaceInvites,
  workspaceShareLinks,
  workspaces,
} from "@/lib/db/schema";
import { getFullImageUrl, getPageTitle, seoConfig } from "@/lib/seo-config";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ token: string }>;
  children: React.ReactNode;
};

function buildMetadata({
  title,
  description,
  url,
}: {
  title: string;
  description: string;
  url: string;
}): Metadata {
  const fullTitle = getPageTitle(title);
  const imageUrl = getFullImageUrl();

  return {
    title: fullTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: seoConfig.siteName,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [imageUrl],
    },
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const url = `${seoConfig.siteUrl}/invite/claim/${token}`;

  const [emailInvite] = await db
    .select({
      expiresAt: workspaceInvites.expiresAt,
      workspaceName: workspaces.name,
      inviterName: user.name,
      inviterEmail: user.email,
    })
    .from(workspaceInvites)
    .leftJoin(workspaces, eq(workspaces.id, workspaceInvites.workspaceId))
    .leftJoin(user, eq(user.id, workspaceInvites.inviterId))
    .where(eq(workspaceInvites.token, token))
    .limit(1);

  if (emailInvite) {
    if (new Date(emailInvite.expiresAt) < new Date()) {
      return buildMetadata({
        title: "Invite Link Expired",
        description: "This workspace invite link has expired.",
        url,
      });
    }

    if (!emailInvite.workspaceName) {
      return buildMetadata({
        title: "Invite Link Not Found",
        description: "This invite link is invalid or has been removed.",
        url,
      });
    }

    const inviterName =
      emailInvite.inviterName || emailInvite.inviterEmail || "Someone";
    const title = `Join ${emailInvite.workspaceName} on ThinkEx — invited by ${inviterName}`;
    const description = `Accept your invitation to join ${emailInvite.workspaceName} on ThinkEx.`;

    return buildMetadata({ title, description, url });
  }

  const [shareLink] = await db
    .select({
      expiresAt: workspaceShareLinks.expiresAt,
      workspaceName: workspaces.name,
    })
    .from(workspaceShareLinks)
    .leftJoin(workspaces, eq(workspaces.id, workspaceShareLinks.workspaceId))
    .where(eq(workspaceShareLinks.token, token))
    .limit(1);

  if (!shareLink || !shareLink.workspaceName) {
    return buildMetadata({
      title: "Invite Link Not Found",
      description: "This invite link is invalid or has been removed.",
      url,
    });
  }

  if (new Date(shareLink.expiresAt) < new Date()) {
    return buildMetadata({
      title: "Invite Link Expired",
      description: "This workspace invite link has expired.",
      url,
    });
  }

  const title = `Shared Workspace: ${shareLink.workspaceName}`;
  const description = `Join "${shareLink.workspaceName}" on ThinkEx. Collaborate on documents and build knowledge together.`;

  return buildMetadata({ title, description, url });
}

export default function InviteClaimLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
