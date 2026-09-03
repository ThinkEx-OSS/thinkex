import { createServerFn } from "@tanstack/react-start";
import { env } from "cloudflare:workers";
import { z } from "zod";

import {
	createWorkspaceInputSchema,
	createWorkspaceItemInputSchema,
	deleteWorkspaceInputSchema,
	deleteWorkspaceItemsInputSchema,
	moveWorkspaceItemsInputSchema,
	renameWorkspaceItemInputSchema,
	setWorkspaceArchiveStatusInputSchema,
	updateWorkspaceInputSchema,
	updateWorkspaceItemColorInputSchema,
} from "#/features/workspaces/contracts";
import {
	createWorkspaceItem,
	deleteWorkspaceItems,
	moveWorkspaceItems,
	renameWorkspaceItem,
	updateWorkspaceItemColor,
} from "#/features/workspaces/persistence/workspace-items";
import { requireAppliedWorkspaceMutation } from "#/features/workspaces/persistence/workspace-persistence-types";
import {
	createWorkspaceForCurrentUser,
	deleteWorkspaceForCurrentUser,
	recordWorkspaceOpenedForCurrentUser,
	setWorkspaceArchiveStatusForCurrentUser,
	updateWorkspaceForCurrentUser,
} from "#/features/workspaces/server/mutations";
import { getCurrentUserId } from "#/features/workspaces/server/permissions";
import {
	getWorkspacePageForCurrentUser,
	listWorkspacesForCurrentUser,
} from "#/features/workspaces/server/queries";

const workspaceIdInputSchema = z.object({
	workspaceId: z.string().min(1),
});

export const listWorkspacesFn = createServerFn({ method: "GET" }).handler(async () =>
	listWorkspacesForCurrentUser(),
);

export const getWorkspacePageFn = createServerFn({ method: "GET" })
	.validator(workspaceIdInputSchema)
	.handler(async ({ data }) => getWorkspacePageForCurrentUser(data.workspaceId));

export const createWorkspaceFn = createServerFn({ method: "POST" })
	.validator(createWorkspaceInputSchema)
	.handler(async ({ data }) => createWorkspaceForCurrentUser(data));

export const recordWorkspaceOpenedFn = createServerFn({ method: "POST" })
	.validator(workspaceIdInputSchema)
	.handler(async ({ data }) => recordWorkspaceOpenedForCurrentUser(data.workspaceId));

export const updateWorkspaceFn = createServerFn({ method: "POST" })
	.validator(updateWorkspaceInputSchema)
	.handler(async ({ data }) => updateWorkspaceForCurrentUser(data));

export const setWorkspaceArchiveStatusFn = createServerFn({ method: "POST" })
	.validator(setWorkspaceArchiveStatusInputSchema)
	.handler(async ({ data }) => setWorkspaceArchiveStatusForCurrentUser(data));

export const deleteWorkspaceFn = createServerFn({ method: "POST" })
	.validator(deleteWorkspaceInputSchema)
	.handler(async ({ data }) => deleteWorkspaceForCurrentUser(data));

export const createWorkspaceItemFn = createServerFn({ method: "POST" })
	.validator(createWorkspaceItemInputSchema)
	.handler(async ({ data }) => {
		return requireAppliedWorkspaceMutation(
			await createWorkspaceItem(env, {
				...data,
				actorUserId: await getCurrentUserId(),
			}),
		);
	});

export const renameWorkspaceItemFn = createServerFn({ method: "POST" })
	.validator(renameWorkspaceItemInputSchema)
	.handler(async ({ data }) => {
		return requireAppliedWorkspaceMutation(
			await renameWorkspaceItem(env, {
				...data,
				actorUserId: await getCurrentUserId(),
			}),
		);
	});

export const moveWorkspaceItemsFn = createServerFn({ method: "POST" })
	.validator(moveWorkspaceItemsInputSchema)
	.handler(async ({ data }) => {
		return requireAppliedWorkspaceMutation(
			await moveWorkspaceItems(env, {
				...data,
				actorUserId: await getCurrentUserId(),
			}),
		);
	});

export const updateWorkspaceItemColorFn = createServerFn({ method: "POST" })
	.validator(updateWorkspaceItemColorInputSchema)
	.handler(async ({ data }) =>
		updateWorkspaceItemColor(env, {
			...data,
			actorUserId: await getCurrentUserId(),
		}),
	);

export const deleteWorkspaceItemsFn = createServerFn({ method: "POST" })
	.validator(deleteWorkspaceItemsInputSchema)
	.handler(async ({ data }) =>
		deleteWorkspaceItems(env, {
			...data,
			actorUserId: await getCurrentUserId(),
		}),
	);
