import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { workspacePageQueryKey } from "#/features/workspaces/cache-keys";
import {
	applyWorkspacePageDeltaToCache,
	createWorkspaceItemInPageCache,
	moveWorkspaceItemsInPageCache,
	removeWorkspaceItemsFromPageCache,
} from "#/features/workspaces/cache-page";
import type {
	CreateWorkspaceItemInput,
	DeleteWorkspaceItemsInput,
	MoveWorkspaceItemsInput,
	RenameWorkspaceItemInput,
	UpdateWorkspaceItemColorInput,
} from "#/features/workspaces/contracts";
import { resolveWorkspaceItemColorForCreate } from "#/features/workspaces/model/workspace-item-colors";
import {
	createWorkspaceItemFn,
	deleteWorkspaceItemsFn,
	moveWorkspaceItemsFn,
	renameWorkspaceItemFn,
	updateWorkspaceItemColorFn,
} from "#/features/workspaces/server/functions";
import { getErrorMessage } from "#/lib/error-message";
export function useCreateWorkspaceItemMutation() {
	const createWorkspaceItem = useServerFn(createWorkspaceItemFn);
	const queryClient = useQueryClient();

	const mutation = useMutation({
		mutationFn: (preparedInput: CreateWorkspaceItemInput) =>
			createWorkspaceItem({ data: preparedInput }),
		onMutate: async (preparedInput) => {
			await queryClient.cancelQueries({
				queryKey: workspacePageQueryKey(preparedInput.workspaceId),
			});

			if (preparedInput.id) {
				createWorkspaceItemInPageCache(queryClient, {
					...preparedInput,
					id: preparedInput.id,
				});
			}
		},
		onSuccess: (command, input) => {
			applyWorkspacePageDeltaToCache(queryClient, {
				type: "workspace.items.upserted",
				workspaceId: input.workspaceId,
				items: [command.result],
				revision: command.revision,
			});
		},
		onError: (error, preparedInput) => {
			if (preparedInput.id) {
				removeWorkspaceItemsFromPageCache(queryClient, preparedInput.workspaceId, [
					preparedInput.id,
				]);
			}
			toast.error(getErrorMessage(error, "Unable to create workspace item right now."));
		},
	});

	return {
		...mutation,
		mutate: (input: CreateWorkspaceItemInput, options?: Parameters<typeof mutation.mutate>[1]) => {
			mutation.mutate(prepareCreateWorkspaceItemInput(input), options);
		},
		mutateAsync: (
			input: CreateWorkspaceItemInput,
			options?: Parameters<typeof mutation.mutateAsync>[1],
		) => {
			return mutation.mutateAsync(prepareCreateWorkspaceItemInput(input), options);
		},
	};
}

export function useRenameWorkspaceItemMutation() {
	const renameWorkspaceItem = useServerFn(renameWorkspaceItemFn);
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: RenameWorkspaceItemInput) => renameWorkspaceItem({ data: input }),
		onSuccess: (command, input) => {
			applyWorkspacePageDeltaToCache(queryClient, {
				type: "workspace.items.upserted",
				workspaceId: input.workspaceId,
				items: [command.result],
				revision: command.revision,
			});
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, "Unable to rename workspace item right now."));
		},
	});
}

export function useMoveWorkspaceItemsMutation() {
	const moveWorkspaceItems = useServerFn(moveWorkspaceItemsFn);
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: MoveWorkspaceItemsInput) => moveWorkspaceItems({ data: input }),
		onMutate: async (input) => {
			await queryClient.cancelQueries({
				queryKey: workspacePageQueryKey(input.workspaceId),
			});

			moveWorkspaceItemsInPageCache(queryClient, input);
		},
		onSuccess: (command, input) => {
			applyWorkspacePageDeltaToCache(queryClient, {
				type: "workspace.items.upserted",
				workspaceId: input.workspaceId,
				items: command.result,
				revision: command.revision,
			});
		},
		onError: (_error, input) => refreshWorkspacePage(queryClient, input.workspaceId),
	});
}

export function useUpdateWorkspaceItemColorMutation() {
	const updateWorkspaceItemColor = useServerFn(updateWorkspaceItemColorFn);
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: UpdateWorkspaceItemColorInput) => updateWorkspaceItemColor({ data: input }),
		onSuccess: (command, input) => {
			applyWorkspacePageDeltaToCache(queryClient, {
				type: "workspace.items.upserted",
				workspaceId: input.workspaceId,
				items: [command.result],
				revision: command.revision,
			});
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, "Unable to update item color right now."));
		},
	});
}

export function useDeleteWorkspaceItemsMutation() {
	const deleteWorkspaceItems = useServerFn(deleteWorkspaceItemsFn);
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (input: DeleteWorkspaceItemsInput) => {
			const deletePromise = deleteWorkspaceItems({
				data: input,
			});

			void toast.promise(deletePromise, {
				loading: getDeleteWorkspaceItemsToastMessage("Deleting", input.itemIds.length, "..."),
				success: getDeleteWorkspaceItemsToastMessage("Deleted", input.itemIds.length, "."),
				error: (error) =>
					getErrorMessage(
						error,
						getDeleteWorkspaceItemsToastMessage(
							"Unable to delete",
							input.itemIds.length,
							" right now.",
						),
					),
			});

			return deletePromise;
		},
		onMutate: async (input) => {
			await queryClient.cancelQueries({
				queryKey: workspacePageQueryKey(input.workspaceId),
			});

			removeWorkspaceItemsFromPageCache(queryClient, input.workspaceId, input.itemIds);
		},
		onSuccess: (command, input) => {
			if (command.result.deletedItemIds.length > 0) {
				applyWorkspacePageDeltaToCache(queryClient, {
					type: "workspace.items.deleted",
					workspaceId: input.workspaceId,
					itemIds: command.result.deletedItemIds,
					revision: command.revision,
				});
			}
		},
		onError: (_error, input) => refreshWorkspacePage(queryClient, input.workspaceId),
	});
}

function getDeleteWorkspaceItemsToastMessage(
	action: "Deleting" | "Deleted" | "Unable to delete",
	itemCount: number,
	suffix: string,
) {
	return `${action} ${itemCount === 1 ? "item" : `${itemCount} items`}${suffix}`;
}

function refreshWorkspacePage(queryClient: QueryClient, workspaceId: string) {
	return queryClient.invalidateQueries({ queryKey: workspacePageQueryKey(workspaceId) });
}

function prepareCreateWorkspaceItemInput(
	input: CreateWorkspaceItemInput,
): CreateWorkspaceItemInput {
	const color = resolveWorkspaceItemColorForCreate({
		type: input.type,
		color: input.color,
	});

	if (!color) {
		return input;
	}

	return { ...input, color };
}
