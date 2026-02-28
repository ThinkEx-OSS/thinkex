import { Metadata } from "next";
import { db } from "@/lib/db/client";
import { workspaceShareLinks, workspaces } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { seoConfig, getPageTitle, getFullImageUrl } from "@/lib/seo-config";

type Props = {
    params: Promise<{ token: string }>;
    children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { token } = await params;

    const [shareLink] = await db
        .select({
            workspaceId: workspaceShareLinks.workspaceId,
            expiresAt: workspaceShareLinks.expiresAt,
            workspaceName: workspaces.name,
        })
        .from(workspaceShareLinks)
        .innerJoin(workspaces, eq(workspaces.id, workspaceShareLinks.workspaceId))
        .where(eq(workspaceShareLinks.token, token))
        .limit(1);

    if (!shareLink) {
        const notFoundTitle = "Invite Link Not Found";
        const notFoundDesc = "This invite link is invalid or has been removed.";
        return {
            title: getPageTitle(notFoundTitle),
            description: notFoundDesc,
            openGraph: {
                title: getPageTitle(notFoundTitle),
                description: notFoundDesc,
                url: `${seoConfig.siteUrl}/invite/link/${token}`,
                siteName: seoConfig.siteName,
                images: [{ url: getFullImageUrl(), width: 1200, height: 630, alt: notFoundTitle }],
                type: "website",
            },
            twitter: { card: "summary_large_image", title: getPageTitle(notFoundTitle), description: notFoundDesc },
        };
    }

    if (new Date(shareLink.expiresAt) < new Date()) {
        const expiredTitle = "Invite Link Expired";
        const expiredDesc = "This workspace invite link has expired.";
        return {
            title: getPageTitle(expiredTitle),
            description: expiredDesc,
            openGraph: {
                title: getPageTitle(expiredTitle),
                description: expiredDesc,
                url: `${seoConfig.siteUrl}/invite/link/${token}`,
                siteName: seoConfig.siteName,
                images: [{ url: getFullImageUrl(), width: 1200, height: 630, alt: expiredTitle }],
                type: "website",
            },
            twitter: { card: "summary_large_image", title: getPageTitle(expiredTitle), description: expiredDesc },
        };
    }

    const workspaceName = shareLink.workspaceName || "Workspace";
    const sharedTitle = `Shared Workspace: ${workspaceName}`;
    const description = `Join "${workspaceName}" on ThinkEx. Collaborate on notes and build knowledge together.`;
    const fullTitle = getPageTitle(sharedTitle);
    const url = `${seoConfig.siteUrl}/invite/link/${token}`;

    return {
        title: fullTitle,
        description,
        openGraph: {
            title: fullTitle,
            description,
            url,
            siteName: seoConfig.siteName,
            images: [{ url: getFullImageUrl(), width: 1200, height: 630, alt: sharedTitle }],
            type: "website",
        },
        twitter: {
            card: "summary_large_image",
            title: fullTitle,
            description,
            images: [getFullImageUrl()],
        },
    };
}

export default function InviteLinkLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
