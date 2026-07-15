import { requestWorkspaceFileProcessor } from "#/features/workspaces/files/workspace-file-processor";
import type { WorkspaceFileAssetKind } from "#/features/workspaces/model/workspace-file";
import { assertPreparedPdfPreviewResponse } from "#/features/workspaces/upload/pdf-upload-validation";
import { requireSizedResponseBody } from "#/lib/http/sized-response-body";

export { WORKSPACE_FILE_PREVIEW_CONTENT_TYPE } from "#/features/workspaces/files/workspace-file-preview.constants";

export async function createWorkspaceFilePreview(
	env: Cloudflare.Env,
	input: {
		assetKind: WorkspaceFileAssetKind;
		body: ReadableStream<Uint8Array>;
		contentType: string;
		sizeBytes: number;
	},
) {
	const response = await requestWorkspaceFileProcessor(env, {
		body: input.body,
		contentType: input.contentType,
		path: input.assetKind === "pdf" ? "/prepare/pdf" : "/preview/image",
		sizeBytes: input.sizeBytes,
	});

	if (input.assetKind === "pdf") {
		await assertPreparedPdfPreviewResponse(response);
	} else if (!response.ok) {
		throw new Error(`Workspace preview generation failed with status ${response.status}.`);
	}

	return requireSizedResponseBody(
		response,
		() => new Error("Workspace preview response is missing a valid content length."),
	);
}
