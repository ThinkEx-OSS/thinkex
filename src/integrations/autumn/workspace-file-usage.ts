import { trackAutumnUsage } from "#/integrations/autumn/client";

export const WORKSPACE_FILE_UPLOAD_FEATURE_ID = "file_uploads";

export interface TrackWorkspaceFileUploadUsageInput {
	assetKind: string;
	env: Cloudflare.Env;
	itemId: string;
	userId: string | null;
	workspaceId: string;
}

/**
 * Metered per upload rather than per page. LlamaParse bills per page, but nobody
 * knows a PDF's page count before uploading, and a balance that drops by an
 * unpredictable amount is the thing that makes people stop uploading. Median
 * upload is 5 pages and p90 is 31, so uploads track cost closely enough.
 *
 * Counted when extraction is requested, not when bytes land, because extraction
 * is what actually costs money — and every extraction routes through one caller.
 */
export async function trackWorkspaceFileUploadUsage(input: TrackWorkspaceFileUploadUsageInput) {
	// Background extraction can run without an actor; there is no customer to bill.
	if (!input.userId) {
		return;
	}

	await trackAutumnUsage({
		env: input.env,
		event: "workspace_file_upload_usage_tracking",
		featureId: WORKSPACE_FILE_UPLOAD_FEATURE_ID,
		properties: {
			asset_kind: input.assetKind,
			feature_surface: "workspace_file_upload",
			item_id: input.itemId,
			workspace_id: input.workspaceId,
		},
		userId: input.userId,
	});
}
