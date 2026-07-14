import { requestWorkspaceFileProcessor } from "#/features/workspaces/files/workspace-file-processor";
import type { WorkspaceFileAssetKind } from "#/features/workspaces/model/workspace-file";

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
		path: input.assetKind === "pdf" ? "/preview/pdf" : "/preview/image",
		sizeBytes: input.sizeBytes,
	});

	if (!response.ok || !response.body) {
		throw new Error(`Workspace preview generation failed with status ${response.status}.`);
	}

	return response;
}
