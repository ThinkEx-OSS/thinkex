import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";
import {
	getWorkspaceKernelAiItemLinks,
	getWorkspaceKernelAiPageContext,
	resolveWorkspaceKernelAiExistingItemPath,
	resolveWorkspaceKernelAiLinkPaths,
	type WorkspaceKernelAiLinkResolutionFailureCode,
} from "#/features/workspaces/ai/workspace-kernel-ai-common";
import type { DocumentSessionApplyMarkdownEditsResult } from "#/features/workspaces/documents/document-session";
import type { DocumentMarkdownEdit } from "#/features/workspaces/documents/document-markdown-edits";
import type { WorkspaceItemLink } from "#/features/workspaces/model/workspace-item-links";

type EditWorkspaceKernelAiFailureCode =
	| "cannot_edit_root"
	| WorkspaceKernelAiLinkResolutionFailureCode
	| "missing_edit_operation"
	| "path_not_absolute"
	| "path_not_found"
	| "unsupported_item_type";

export interface EditWorkspaceKernelAiItemInput {
	edits?: DocumentMarkdownEdit[];
	links?: string[];
	path: string;
	userId: string;
	workspaceId: string;
}

type EditWorkspaceKernelAiFailure = DocumentSessionApplyMarkdownEditsResult["failures"][number] & {
	path?: string;
};

export interface EditWorkspaceKernelAiItemResult {
	applied: number;
	failed: EditWorkspaceKernelAiFailure[];
	links?: WorkspaceItemLink[];
	path: string;
	warnings: string[];
}

export async function editWorkspaceKernelAiItem(
	input: EditWorkspaceKernelAiItemInput,
): Promise<EditWorkspaceKernelAiItemResult> {
	const context = await getWorkspaceKernelAiPageContext({
		access: "mutate",
		userId: input.userId,
		workspaceId: input.workspaceId,
	});
	const edits = input.edits ?? [];
	const resolution = resolveWorkspaceKernelAiExistingItemPath({
		path: input.path,
		rootFailureCode: "cannot_edit_root",
		tree: context.tree,
	});

	if (resolution.status === "failed") {
		return {
			path: resolution.failure.path,
			warnings: [],
			...failedWorkspaceAiEditResult(resolution.failure.code, Math.max(edits.length, 1)),
		};
	}

	if (edits.length === 0 && input.links === undefined) {
		return {
			path: resolution.path,
			warnings: [],
			...failedWorkspaceAiEditResult("missing_edit_operation", 1),
		};
	}

	const links =
		input.links === undefined
			? undefined
			: resolveWorkspaceKernelAiLinkPaths({
					paths: input.links,
					tree: context.tree,
				});

	if (links?.status === "failed") {
		return {
			path: resolution.path,
			warnings: [],
			...failedWorkspaceAiEditResult(
				links.code,
				Math.max(edits.length, 1),
				links.index,
				links.path,
			),
		};
	}

	const linkItemIds = links?.linkItemIds.filter((linkItemId) => linkItemId !== resolution.item.id);

	if (edits.length === 0) {
		const command = await context.kernel.updateItemLinks({
			itemId: resolution.item.id,
			linkItemIds: linkItemIds ?? [],
			actorUserId: input.userId,
			clientMutationId: null,
		});

		return {
			applied: 0,
			failed: [],
			links: getWorkspaceKernelAiItemLinks({
				item: command.result,
				pageItems: context.pageItems,
			}),
			path: resolution.path,
			warnings: [],
		};
	}

	if (resolution.item.type !== "document") {
		return {
			path: resolution.path,
			warnings: [],
			...failedWorkspaceAiEditResult("unsupported_item_type", edits.length),
		};
	}

	const documentSession = await getDocumentSession({
		itemId: resolution.item.id,
		workspaceId: input.workspaceId,
	});

	const result = await documentSession.applyMarkdownEdits({
		edits,
	});
	const command =
		links === undefined || result.failures.length > 0
			? null
			: await context.kernel.updateItemLinks({
					itemId: resolution.item.id,
					linkItemIds: linkItemIds ?? [],
					actorUserId: input.userId,
					clientMutationId: null,
				});

	return {
		applied: result.applied,
		failed: result.failures,
		...(command
			? {
					links: getWorkspaceKernelAiItemLinks({
						item: command.result,
						pageItems: context.pageItems,
					}),
				}
			: {}),
		path: resolution.path,
		warnings: result.warnings,
	};
}

async function getDocumentSession(input: { itemId: string; workspaceId: string }) {
	const { env } = await import("cloudflare:workers");

	return getDocumentSessionFromEnv(env, input);
}

function failedWorkspaceAiEditResult(
	code: EditWorkspaceKernelAiFailureCode,
	editCount: number,
	failureIndex?: number,
	failurePath?: string,
): Pick<EditWorkspaceKernelAiItemResult, "applied" | "failed"> {
	if (failureIndex !== undefined) {
		return {
			applied: 0,
			failed: [
				{
					code,
					index: failureIndex,
					...(failurePath === undefined ? {} : { path: failurePath }),
				},
			],
		};
	}

	return {
		applied: 0,
		failed: Array.from({ length: editCount }, (_, index) => ({
			code,
			index,
		})),
	};
}
