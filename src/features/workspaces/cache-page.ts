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
	applyWorkspaceEventToPage,
	createWorkspaceItemInPage,
	moveWorkspaceItemsInPage,
	removeWorkspaceItemsFromPage,
	updateWorkspaceItemColorInPage,
	upsertWorkspaceItemsInPage,
} from "#/features/workspaces/model/workspace-page";
import type { WorkspaceRealtimeEvent } from "#/features/workspaces/realtime/messages";

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
	let previousItems: WorkspaceItemSummary[] | undefined;

	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(input.workspaceId), (current) => {
		if (!current) {
			return current;
		}

		const moveResult = moveWorkspaceItemsInPage(current, input);

		if (!moveResult) {
			return current;
		}

		previousItems = moveResult.previousItems;
		return moveResult.page;
	});

	return previousItems;
}

export function removeWorkspaceItemsFromPageCache(
	queryClient: QueryClient,
	workspaceId: string,
	itemIds: string[],
) {
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(workspaceId), (current) =>
		current ? removeWorkspaceItemsFromPage(current, itemIds) : current,
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

export function restoreWorkspaceItemsInPageCache(
	queryClient: QueryClient,
	items: readonly WorkspaceItemSummary[] | undefined,
) {
	if (!items || items.length === 0) {
		return;
	}

	queryClient.setQueryData<WorkspacePage>(
		workspacePageQueryKey(items[0].workspaceId),
		(current) => {
			if (!current) {
				return current;
			}

			return upsertWorkspaceItemsInPage(current, items);
		},
	);
}

export function applyWorkspaceEventToCache(
	queryClient: QueryClient,
	event: WorkspaceRealtimeEvent,
) {
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(event.workspaceId), (current) =>
		current ? applyWorkspaceEventToPage(current, event) : current,
	);
}
