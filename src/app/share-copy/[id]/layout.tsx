import { Metadata } from "next";
import { db, workspaces } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { seoConfig, getPageTitle, getFullImageUrl } from "@/lib/seo-config";

type Props = {
    params: Promise<{ id: string }>;
    children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const { id } = await params;

    // Fetch workspace basic info
    const workspace = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, id))
        .limit(1);

    if (!workspace[0]) {
        const notFoundTitle = "Workspace Not Found";
        const notFoundDesc = "The shared workspace could not be found.";
        return {
            title: getPageTitle(notFoundTitle),
            description: notFoundDesc,
            openGraph: {
                title: getPageTitle(notFoundTitle),
                description: notFoundDesc,
                url: `${seoConfig.siteUrl}/share-copy/${id}`,
                siteName: seoConfig.siteName,
                images: [{ url: getFullImageUrl(), width: 1200, height: 630, alt: notFoundTitle }],
                type: "website",
            },
            twitter: { card: "summary_large_image", title: getPageTitle(notFoundTitle), description: notFoundDesc },
        };
    }

    // Fetch full state to get potentially updated title/description
    const state = await loadWorkspaceState(id);

    const title = state.globalTitle || workspace[0].name || "Untitled Workspace";
    const sharedTitle = `Shared Workspace: ${title}`;
    const description = workspace[0].description || "View and import this shared ThinkEx workspace.";
    const fullTitle = getPageTitle(sharedTitle);
    const url = `${seoConfig.siteUrl}/share-copy/${id}`;

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

export default function ShareLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
