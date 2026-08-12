import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getRouteApi, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { upsertWorkspaceInList } from "#/features/workspaces/cache";
import WorkspaceShellSkeleton from "#/features/workspaces/components/WorkspaceShellSkeleton";
import { workspacePageQueryOptions } from "#/features/workspaces/query-options";
import { useWorkspaceUiSession } from "#/features/workspaces/state/workspace-ui-store";
import {
	consumeInitialOpenRecordSkip,
	useRecordWorkspaceOpenedMutation,
} from "#/features/workspaces/use-record-workspace-opened";
import { WorkspaceShell } from "./WorkspaceLayout";

const routeApi = getRouteApi("/_protected/workspaces/$workspaceId");

export default function WorkspacePageRoute() {
	const { workspaceId } = routeApi.useParams();
	const { tab, view } = routeApi.useSearch({
		select: (search) => ({
			tab: search.tab,
			view: search.view,
		}),
		structuralSharing: true,
	});
	const queryClient = useQueryClient();
	const [recordedWorkspaceIds] = useState(() => new Set<string>());
	const recordWorkspaceOpenedMutation = useRecordWorkspaceOpenedMutation();
	const { chatSurfaceMode } = useWorkspaceUiSession(workspaceId);
	const { data: page, error, isSuccess } = useQuery(workspacePageQueryOptions(workspaceId));

	useEffect(() => {
		if (!page) {
			return;
		}

		// Keep the workspace's list entry (name/color/lastOpened) in sync with the
		// freshly loaded page. `update-existing` so we never fabricate a single-item
		// list when the full list hasn't been fetched yet (that would make /home
		// flash just this one workspace). The page cache is intentionally not
		// re-seeded here: `page` already came from it.
		upsertWorkspaceInList(queryClient, page.workspace, "update-existing");
	}, [page, queryClient]);

	useEffect(() => {
		if (!page || recordedWorkspaceIds.has(workspaceId)) {
			return;
		}

		recordedWorkspaceIds.add(workspaceId);

		// A workspace we just created is already stamped as opened by the server;
		// recording again here would race the insert with a doomed request.
		if (consumeInitialOpenRecordSkip(workspaceId)) {
			return;
		}

		recordWorkspaceOpenedMutation.mutate({ workspaceId });
	}, [page, recordWorkspaceOpenedMutation, recordedWorkspaceIds, workspaceId]);

	if (error && !page) {
		throw error;
	}

	if (isSuccess && !page) {
		throw notFound({ data: { resource: "workspace" } });
	}

	if (!page) {
		return <WorkspaceShellSkeleton chatSurfaceMode={chatSurfaceMode} />;
	}

	return (
		<WorkspaceShell
			activeTabIdFromUrl={tab}
			activeViewFromUrl={view}
			items={page.items}
			revision={page.revision}
			workspace={page.workspace}
		/>
	);
}
