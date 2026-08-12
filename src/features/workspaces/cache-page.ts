import type { QueryClient } from "@tanstack/react-query";
import { workspacePageQueryKey } from "#/features/workspaces/cache-keys";
import type {
	CreateWorkspaceItemInput,
	MoveWorkspaceItemsInput,
	WorkspacePage,
} from "#/features/workspaces/contracts";
import {
	createWorkspaceItemInPage,
	moveWorkspaceItemsInPage,
	removeWorkspaceItemsFromPage,
	upsertWorkspaceItemInPage,
} from "#/features/workspaces/model/workspace-page";
import type { WorkspacePageDelta } from "#/features/workspaces/realtime/messages";

export function applyWorkspacePageDeltaToCache(
	queryClient: QueryClient,
	change: WorkspacePageDelta,
) {
	let shouldReconcile = false;
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(change.workspaceId), (current) => {
		if (!current) return current;
		if (change.revision <= current.revision) return current;
		if (change.revision !== current.revision + 1) {
			shouldReconcile = true;
			return current;
		}
		if (change.type === "workspace.items.deleted") {
			return removeWorkspaceItemsFromPage(current, change.itemIds, change.revision);
		}
		return change.items.reduce(
			(page, item) => upsertWorkspaceItemInPage(page, item, change.revision),
			current,
		);
	});
	if (shouldReconcile) {
		void queryClient.invalidateQueries({ queryKey: workspacePageQueryKey(change.workspaceId) });
	}
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

export function removeWorkspaceItemsFromPageCache(
	queryClient: QueryClient,
	workspaceId: string,
	itemIds: string[],
) {
	queryClient.setQueryData<WorkspacePage>(workspacePageQueryKey(workspaceId), (current) =>
		current ? removeWorkspaceItemsFromPage(current, itemIds) : current,
	);
}
