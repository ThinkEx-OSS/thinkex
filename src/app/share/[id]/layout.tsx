import { Metadata } from "next";
import { db, workspaces } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";

type Props = {
    params: Promise<{ id: string }>;
    children: React.ReactNode;
};

export async function generateMetadata(
    { params }: Props
): Promise<Metadata> {
    const { id } = await params;

    // Fetch workspace basic info
    const workspace = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, id))
        .limit(1);

    if (!workspace[0]) {
        return {
            title: "Workspace Not Found",
            description: "The shared workspace could not be found.",
        };
    }

    // Fetch full state to get potentially updated title/description
    const state = await loadWorkspaceState(id);

    const title = state.globalTitle || workspace[0].name || "Untitled Workspace";
    const description = state.globalDescription || workspace[0].description || "View and import this shared ThinkEx workspace.";

    return {
        title: `Shared Workspace: ${title}`,
        description: description,
    };
}

export default function ShareLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
