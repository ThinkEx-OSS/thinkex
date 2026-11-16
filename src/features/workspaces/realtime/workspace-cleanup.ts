import { getDocumentSessionStubFromEnv } from "#/features/workspaces/document-session-access";
import { isTransientDurableObjectError } from "#/features/workspaces/durable-object-errors";
import { getWorkspaceFileItemObjectPrefix } from "#/features/workspaces/files/workspace-file-object-keys";
import { getWorkspaceRecordingObjectPrefix } from "#/features/workspaces/recordings/workspace-recording-object-keys";
import type { ResourcePurgeResult } from "#/features/workspaces/resource-purge-result";
import {
	logOperationalEvent,
	recordOperationalFailure,
} from "#/integrations/observability/operational-events";
import { getTelemetryRuntimeContext } from "#/integrations/posthog/server-context";
import { deleteR2Prefix } from "#/lib/r2";

export async function purgeDeletedWorkspaceItems(
	env: Cloudflare.Env,
	input: {
		documentItemIds: string[];
		fileItemIds: string[];
		recordingItemIds: string[];
		workspaceId: string;
	},
): Promise<ResourcePurgeResult> {
	const documentItemIds = Array.from(new Set(input.documentItemIds));
	const fileItemIds = Array.from(new Set(input.fileItemIds));
	const recordingItemIds = Array.from(new Set(input.recordingItemIds));
	const results = await Promise.allSettled([
		...documentItemIds.map((itemId) => purgeDocumentSession(env, input.workspaceId, itemId)),
		...fileItemIds.map((itemId) =>
			deleteR2Prefix(
				env.WORKSPACE_FILES,
				getWorkspaceFileItemObjectPrefix({ workspaceId: input.workspaceId, itemId }),
			),
		),
		...recordingItemIds.map((itemId) =>
			deleteR2Prefix(
				env.WORKSPACE_FILES,
				getWorkspaceRecordingObjectPrefix({ workspaceId: input.workspaceId, itemId }),
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
		deleteR2Prefix(env.WORKSPACE_FILES, `workspace_recordings/${input.workspaceId}/`),
	]);

	return summarizeCleanup(results);
}

async function purgeDocumentSession(env: Cloudflare.Env, workspaceId: string, itemId: string) {
	try {
		await getDocumentSessionStubFromEnv(env, { workspaceId, itemId }).purgeForDeletion();
	} catch (error) {
		const fields = { item_id: itemId, workspace_id: workspaceId };
		// The room retries incomplete cleanup and captures only when retries run out.
		if (isTransientDurableObjectError(error)) {
			logOperationalEvent({
				error,
				event: "workspace_document_purge",
				fields: { ...fields, transient: true },
				outcome: "rejected",
				requestContext: getTelemetryRuntimeContext(),
			});
		} else {
			recordOperationalFailure({ error, event: "workspace_document_purge", fields });
		}
		throw error;
	}
}

function summarizeCleanup(results: PromiseSettledResult<unknown>[]): ResourcePurgeResult {
	return {
		attempted: results.length,
		failed: results.filter((result) => result.status === "rejected").length,
	};
}
