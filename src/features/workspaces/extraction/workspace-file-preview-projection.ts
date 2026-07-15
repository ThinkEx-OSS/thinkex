import type { WorkflowStep } from "cloudflare:workers";

import { getWorkspaceFileSourceObject } from "#/features/workspaces/extraction/workspace-file-source";
import type { WorkspaceFileExtractionWorkflowParams } from "#/features/workspaces/extraction/types";
import { getWorkspaceFilePreviewObjectKey } from "#/features/workspaces/files/workspace-file-object-keys";
import {
	createWorkspaceFilePreview,
	WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
} from "#/features/workspaces/files/workspace-file-preview";
import { getWorkspaceKernelFromEnv } from "#/features/workspaces/kernel/workspace-kernel-access";
import { getWorkspaceUploadFamily } from "#/features/workspaces/model/workspace-file";
import { recordOperationalOutcome } from "#/integrations/observability/operational-events";

export async function publishWorkspaceFilePreview(
	env: Cloudflare.Env,
	step: WorkflowStep,
	params: WorkspaceFileExtractionWorkflowParams,
) {
	try {
		return await step.do(
			"publish workspace file preview",
			{ retries: { limit: 1, delay: "5 seconds", backoff: "constant" }, timeout: "2 minutes" },
			async () => generateWorkspaceFilePreview(env, params),
		);
	} catch (error) {
		return step.do("record workspace file preview failure", async () => {
			const kernel = await getWorkspaceKernelFromEnv(env, params.workspaceId);
			const existing = await kernel.readFileProjection({
				itemId: params.itemId,
				format: "preview",
			});

			if (
				existing?.status === "ready" &&
				existing.objectKey &&
				(await env.WORKSPACE_KERNEL_FILES.head(existing.objectKey))
			) {
				return { outcome: "success" as const };
			}

			await kernel.upsertFileProjection({
				itemId: params.itemId,
				format: "preview",
				status: "failed",
				errorMessage: error instanceof Error ? error.message : String(error),
				actorUserId: params.actorUserId,
			});
			return { outcome: "error" as const };
		});
	}
}

async function generateWorkspaceFilePreview(
	env: Cloudflare.Env,
	params: WorkspaceFileExtractionWorkflowParams,
) {
	const startedAt = Date.now();
	const descriptor = getWorkspaceUploadFamily(params.assetKind);

	if (!descriptor.previewGenerator) {
		return { outcome: "skipped" as const };
	}

	const kernel = await getWorkspaceKernelFromEnv(env, params.workspaceId);
	const objectKey = getWorkspaceFilePreviewObjectKey({
		workspaceId: params.workspaceId,
		itemId: params.itemId,
	});
	let failure: unknown;
	let inputBytes = 0;
	let outputBytes = 0;

	try {
		const { object: sourceObject, source } = await getWorkspaceFileSourceObject({
			env,
			itemId: params.itemId,
			kernel,
		});
		inputBytes = sourceObject.size;
		const preview = await createWorkspaceFilePreview(env, {
			assetKind: params.assetKind,
			body: sourceObject.body,
			contentType: source.contentType,
			sizeBytes: source.sizeBytes,
		});
		const object = await env.WORKSPACE_KERNEL_FILES.put(objectKey, preview.body, {
			httpMetadata: { contentType: WORKSPACE_FILE_PREVIEW_CONTENT_TYPE },
		});

		if (!object) {
			throw new Error("Workspace preview could not be stored.");
		}
		outputBytes = object.size;

		await kernel.upsertFileProjection({
			itemId: params.itemId,
			format: "preview",
			status: "ready",
			objectKey,
			sourceHash: sourceObject.etag,
			metadataJson: {
				contentType: WORKSPACE_FILE_PREVIEW_CONTENT_TYPE,
				sizeBytes: object.size,
			},
			actorUserId: params.actorUserId,
		});

		return { outcome: "success" as const };
	} catch (error) {
		failure = error;
		throw error;
	} finally {
		recordOperationalOutcome({
			distinctId: params.actorUserId ?? undefined,
			error: failure,
			event: "workspace_file_preview",
			fields: {
				asset_kind: params.assetKind,
				duration_ms: Date.now() - startedAt,
				input_bytes: inputBytes,
				item_id: params.itemId,
				output_bytes: outputBytes,
				user_id: params.actorUserId,
				workspace_id: params.workspaceId,
			},
		});
	}
}
