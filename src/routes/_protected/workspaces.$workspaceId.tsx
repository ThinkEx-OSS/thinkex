import { createFileRoute } from "@tanstack/react-router";

import AppNotFoundScreen from "#/components/AppNotFoundScreen";
import WorkspacePageRoute from "#/features/workspaces/components/WorkspacePageRoute";
import WorkspaceShellSkeleton from "#/features/workspaces/components/WorkspaceShellSkeleton";
import { workspacePageQueryOptions } from "#/features/workspaces/query-options";
import { getPageTitle } from "#/lib/seo";

export const Route = createFileRoute("/_protected/workspaces/$workspaceId")({
	validateSearch: (search) => ({
		tab: typeof search.tab === "string" ? search.tab : undefined,
		view: typeof search.view === "string" ? search.view : undefined,
	}),
	loader: ({ context, params }) =>
		context.queryClient.ensureQueryData(workspacePageQueryOptions(params.workspaceId)),
	pendingComponent: WorkspaceShellSkeleton,
	pendingMs: 0,
	pendingMinMs: 0,
	notFoundComponent: AppNotFoundScreen,
	head: ({ loaderData }) => ({
		meta: [
			{
				title: getPageTitle(loaderData?.workspace.name || "Workspace"),
			},
		],
	}),
	component: WorkspacePageRoute,
});
