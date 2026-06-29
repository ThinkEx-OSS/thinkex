import { createFileRoute } from "@tanstack/react-router";

import { WorkspaceHomePage } from "#/features/workspaces/components/WorkspaceHomePage";
import { WorkspaceHomePageSkeleton } from "#/features/workspaces/components/WorkspaceHomePageSkeleton";
import { workspacesQueryOptions } from "#/features/workspaces/query-options";

export const Route = createFileRoute("/_protected/home")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(workspacesQueryOptions());
	},
	pendingComponent: WorkspaceHomePageSkeleton,
	pendingMs: 0,
	pendingMinMs: 300,
	head: () => ({
		meta: [
			{
				title: "ThinkEx | Home",
			},
		],
	}),
	component: WorkspaceHomePage,
});
