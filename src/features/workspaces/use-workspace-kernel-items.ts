import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo } from "react";
import { toast } from "sonner";

import {
	createWorkspaceItemInPageCache,
	getWorkspaceItemColorInPageCache,
	moveWorkspaceItemsInPageCache,
	removeWorkspaceItemsFromPageCache,
	updateWorkspaceItemColorInPageCache,
	workspacePageQueryKey,
} from "#/features/workspaces/cache";
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
import { createKeyedDebouncedLatest } from "#/lib/keyed-debounced-latest";

const workspaceItemColorCommitDelayMs = 180;
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
		onSuccess: (_command, input) => refreshWorkspacePage(queryClient, input.workspaceId),
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
		onSuccess: (_command, input) => refreshWorkspacePage(queryClient, input.workspaceId),
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
		onSuccess: (_command, input) => refreshWorkspacePage(queryClient, input.workspaceId),
		onError: (_error, input) => refreshWorkspacePage(queryClient, input.workspaceId),
	});
}

export function useUpdateWorkspaceItemColorMutation() {
	const updateWorkspaceItemColor = useServerFn(updateWorkspaceItemColorFn);
	const queryClient = useQueryClient();

	const commitColor = useMemo(
		() =>
			createKeyedDebouncedLatest<UpdateWorkspaceItemColorInput>({
				getKey: getWorkspaceItemColorCommitKey,
				wait: workspaceItemColorCommitDelayMs,
				onExecute: (input) => {
					updateWorkspaceItemColor({ data: input })
						.then(() => refreshWorkspacePage(queryClient, input.workspaceId))
						.catch((error: unknown) => {
							if (getWorkspaceItemColorInPageCache(queryClient, input) !== input.color) {
								return;
							}

							void refreshWorkspacePage(queryClient, input.workspaceId);
							toast.error(getErrorMessage(error, "Unable to update item color right now."));
						});
				},
			}),
		[queryClient, updateWorkspaceItemColor],
	);

	const mutate = (input: UpdateWorkspaceItemColorInput) => {
		void queryClient.cancelQueries({
			queryKey: workspacePageQueryKey(input.workspaceId),
		});
		updateWorkspaceItemColorInPageCache(queryClient, input);
		commitColor(input);
	};

	return { mutate };
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
		onSuccess: (_command, input) => refreshWorkspacePage(queryClient, input.workspaceId),
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

function getWorkspaceItemColorCommitKey(input: UpdateWorkspaceItemColorInput) {
	return `${input.workspaceId}:${input.itemId}`;
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
