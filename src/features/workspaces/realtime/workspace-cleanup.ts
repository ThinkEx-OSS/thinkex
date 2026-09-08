import { getDocumentSessionStubFromEnv } from "#/features/workspaces/document-session-access";
import { getWorkspaceFileItemObjectPrefix } from "#/features/workspaces/files/workspace-file-object-keys";
import type { ResourcePurgeResult } from "#/features/workspaces/resource-purge-result";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { deleteR2Prefix } from "#/lib/r2";

export async function purgeDeletedWorkspaceItems(
	env: Cloudflare.Env,
	input: { documentItemIds: string[]; fileItemIds: string[]; workspaceId: string },
): Promise<ResourcePurgeResult> {
	const documentItemIds = Array.from(new Set(input.documentItemIds));
	const fileItemIds = Array.from(new Set(input.fileItemIds));
	const results = await Promise.allSettled([
		...documentItemIds.map((itemId) => purgeDocumentSession(env, input.workspaceId, itemId)),
		...fileItemIds.map((itemId) =>
			deleteR2Prefix(
				env.WORKSPACE_FILES,
				getWorkspaceFileItemObjectPrefix({ workspaceId: input.workspaceId, itemId }),
			),
		),
	]);

	return summarizeCleanup(results);
}

export async function purgeWorkspaceStorage(
	env: Cloudflare.Env,
	input: { documentItemIds: string[]; workspaceId: string },
): Promise<ResourcePurgeResult> {
	const documentItemIds = Array.from(new Set(input.documentItemIds));
	const results = await Promise.allSettled([
		...documentItemIds.map((itemId) => purgeDocumentSession(env, input.workspaceId, itemId)),
		// Chat attachments live in Postgres and cascade with their threads.
		deleteR2Prefix(env.WORKSPACE_FILES, `workspace_file_objects/${input.workspaceId}/`),
		deleteR2Prefix(env.WORKSPACE_FILES, `workspace_file_uploads/${input.workspaceId}/`),
	]);

	return summarizeCleanup(results);
}

async function purgeDocumentSession(env: Cloudflare.Env, workspaceId: string, itemId: string) {
	try {
		await getDocumentSessionStubFromEnv(env, { workspaceId, itemId }).purgeForDeletion();
	} catch (error) {
		recordOperationalFailure({
			error,
			event: "workspace_document_purge",
			fields: { item_id: itemId, workspace_id: workspaceId },
		});
		throw error;
	}
}

function summarizeCleanup(results: PromiseSettledResult<unknown>[]): ResourcePurgeResult {
	return {
		attempted: results.length,
		failed: results.filter((result) => result.status === "rejected").length,
	};
}
