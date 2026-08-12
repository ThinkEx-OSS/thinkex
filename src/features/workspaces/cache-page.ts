import type { QueryClient } from "@tanstack/react-query";
import { workspacePageQueryKey } from "#/features/workspaces/cache-keys";
import type {
	CreateWorkspaceItemInput,
	MoveWorkspaceItemsInput,
	UpdateWorkspaceItemColorInput,
	WorkspaceItemSummary,
	WorkspacePage,
} from "#/features/workspaces/contracts";
import {
	applyWorkspacePageDelta,
	createWorkspaceItemInPage,
	moveWorkspaceItemsInPage,
	removeWorkspaceItemsFromPage,
	updateWorkspaceItemColorInPage,
	upsertWorkspaceItemInPage,
} from "#/features/workspaces/model/workspace-page";
import type { WorkspacePageDelta } from "#/features/workspaces/realtime/messages";

export function applyWorkspacePageDeltaToCache(
	queryClient: QueryClient,
	change: WorkspacePageDelta,
) {
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(change.workspaceId), (current) =>
		current ? applyWorkspacePageDelta(current, change) : current,
	);
}

export function createWorkspaceItemInPageCache(
	queryClient: QueryClient,
	input: CreateWorkspaceItemInput & { id: string },
) {
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(input.workspaceId), (current) =>
		current ? createWorkspaceItemInPage(current, input) : current,
	);
}

export function moveWorkspaceItemsInPageCache(
	queryClient: QueryClient,
	input: MoveWorkspaceItemsInput,
) {
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(input.workspaceId), (current) =>
		current ? (moveWorkspaceItemsInPage(current, input) ?? current) : current,
	);
}

export function upsertWorkspaceItemsInPageCache(
	queryClient: QueryClient,
	workspaceId: string,
	items: WorkspaceItemSummary[],
	revision: number,
) {
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(workspaceId), (current) =>
		current
			? items.reduce((page, item) => upsertWorkspaceItemInPage(page, item, revision), current)
			: current,
	);
}

export function removeWorkspaceItemsFromPageCache(
	queryClient: QueryClient,
	workspaceId: string,
	itemIds: string[],
	revision?: number,
) {
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(workspaceId), (current) =>
		current ? removeWorkspaceItemsFromPage(current, itemIds, revision) : current,
	);
}

export function updateWorkspaceItemColorInPageCache(
	queryClient: QueryClient,
	input: UpdateWorkspaceItemColorInput,
) {
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(input.workspaceId), (current) => {
		if (!current) {
			return current;
		}

		const updateResult = updateWorkspaceItemColorInPage(current, input);

		if (!updateResult) {
			return current;
		}

		return updateResult;
	});
}

export function getWorkspaceItemColorInPageCache(
	queryClient: QueryClient,
	input: Pick<UpdateWorkspaceItemColorInput, "itemId" | "workspaceId">,
) {
	const page = queryClient.getQueryData<WorkspacePage>(workspacePageQueryKey(input.workspaceId));

	return page?.items.find((item) => item.id === input.itemId)?.color ?? null;
}
