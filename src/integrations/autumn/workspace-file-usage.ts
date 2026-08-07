import { trackAutumnUsage } from "#/integrations/autumn/client.server";
import { checkAutumnBalance } from "#/integrations/autumn/rest";
import { resolveAutumnSecretKey } from "#/integrations/autumn/secret-key";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { capturePostHogServerEvent } from "#/integrations/posthog/server";

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
 * unpredictable amount is the thing that makes people stop uploading.
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

export interface CheckWorkspaceFileUploadAccessInput {
	env: Cloudflare.Env;
	userId: string;
}

export type WorkspaceFileUploadAccess =
	| { allowed: true }
	| { allowed: false; resetsAt: number | null };

/**
 * Checked before the presigned URL is handed out, so a user over their cap never
 * uploads bytes we then reject — and never pays for the transfer either.
 *
 * No fallback here, unlike chat: the only cheaper path is keeping the free local
 * parse and skipping the paid one, which silently returns worse text with no
 * marker. A user can't tell degraded extraction from a bad product, so blocking
 * is the honest option.
 */
export async function checkWorkspaceFileUploadAccess(
	input: CheckWorkspaceFileUploadAccessInput,
): Promise<WorkspaceFileUploadAccess> {
	const secretKey = resolveAutumnSecretKey(input.env);

	if (!secretKey) {
		return { allowed: true };
	}

	try {
		const result = await checkAutumnBalance({
			customerId: input.userId,
			featureId: WORKSPACE_FILE_UPLOAD_FEATURE_ID,
			secretKey,
		});

		if (result.allowed) {
			return { allowed: true };
		}

		capturePostHogServerEvent({
			distinctId: input.userId,
			event: "usage_limit_reached",
			// Contractual necessity: plan-limit enforcement telemetry, not consented analytics.
			consentExempt: true,
			properties: { feature_id: WORKSPACE_FILE_UPLOAD_FEATURE_ID, surface: "file_upload" },
		});

		return { allowed: false, resetsAt: result.balance?.next_reset_at ?? null };
	} catch (error) {
		// Autumn being unreachable must not block uploads. Fail open, stay visible.
		recordOperationalFailure({
			distinctId: input.userId,
			error,
			event: "workspace_file_upload_access_check",
			fields: { user_id: input.userId },
		});

		return { allowed: true };
	}
}
