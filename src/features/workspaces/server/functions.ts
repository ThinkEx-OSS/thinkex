import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
	createWorkspaceInputSchema,
	createWorkspaceItemInputSchema,
	deleteWorkspaceInputSchema,
	deleteWorkspaceItemsInputSchema,
	moveWorkspaceItemsInputSchema,
	renameWorkspaceItemInputSchema,
	updateWorkspaceInputSchema,
	updateWorkspaceItemColorInputSchema,
} from "#/features/workspaces/contracts";
import {
	createWorkspaceKernelItem,
	deleteWorkspaceKernelItems,
	moveWorkspaceKernelItems,
	renameWorkspaceKernelItem,
	updateWorkspaceKernelItemColor,
} from "#/features/workspaces/kernel/workspace-kernel-access";
import {
	createWorkspaceForCurrentUser,
	deleteWorkspaceForCurrentUser,
	recordWorkspaceOpenedForCurrentUser,
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

export const deleteWorkspaceFn = createServerFn({ method: "POST" })
	.validator(deleteWorkspaceInputSchema)
	.handler(async ({ data }) => deleteWorkspaceForCurrentUser(data));

export const createWorkspaceItemFn = createServerFn({ method: "POST" })
	.validator(createWorkspaceItemInputSchema)
	.handler(async ({ data }) =>
		createWorkspaceKernelItem({
			...data,
			userId: await getCurrentUserId(),
		}),
	);

export const renameWorkspaceItemFn = createServerFn({ method: "POST" })
	.validator(renameWorkspaceItemInputSchema)
	.handler(async ({ data }) =>
		renameWorkspaceKernelItem({
			...data,
			userId: await getCurrentUserId(),
		}),
	);

export const moveWorkspaceItemsFn = createServerFn({ method: "POST" })
	.validator(moveWorkspaceItemsInputSchema)
	.handler(async ({ data }) =>
		moveWorkspaceKernelItems({
			...data,
			userId: await getCurrentUserId(),
		}),
	);

export const updateWorkspaceItemColorFn = createServerFn({ method: "POST" })
	.validator(updateWorkspaceItemColorInputSchema)
	.handler(async ({ data }) =>
		updateWorkspaceKernelItemColor({
			...data,
			userId: await getCurrentUserId(),
		}),
	);

export const deleteWorkspaceItemsFn = createServerFn({ method: "POST" })
	.validator(deleteWorkspaceItemsInputSchema)
	.handler(async ({ data }) =>
		deleteWorkspaceKernelItems({
			...data,
			userId: await getCurrentUserId(),
		}),
	);
