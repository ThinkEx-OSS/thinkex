import type { WorkspaceFileAssetKind } from "#/features/workspaces/model/workspace-file";
import { sha256Base64UrlText } from "#/lib/binary";

export async function getWorkspaceFileExtractionWorkflowId(input: {
	workspaceId: string;
	itemId: string;
	assetKind: WorkspaceFileAssetKind;
	runKey: string;
}) {
	const identity =
		input.runKey === "initial"
			? `${input.workspaceId}:${input.itemId}:${input.assetKind}-extraction:v2`
			: `${input.workspaceId}:${input.itemId}:${input.assetKind}:${input.runKey}-extraction:v3`;
	const digest = await sha256Base64UrlText(identity);

	return `${input.assetKind}-${digest.slice(0, 48)}`;
}
