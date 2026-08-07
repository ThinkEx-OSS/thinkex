import type {
	LiteParseStageOutcome,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import type {
	WorkspaceFileExtractionMode,
	WorkspaceFileExtractionProviderId,
} from "#/features/workspaces/model/workspace-file/types";
import {
	logOperationalEvent,
	recordOperationalFailure,
} from "#/integrations/observability/operational-events";
import { capturePostHogServerEvent } from "#/integrations/posthog/server";
import { getTelemetryRuntimeContext } from "#/integrations/posthog/server-context";
import type { PostHogTelemetryScheduler } from "#/integrations/posthog/scheduler";

/**
 * What the enhanced pass produced, as a value rather than control flow, so the
 * workflow can hand both stage outcomes to one telemetry call instead of shaping a
 * different record at every exit.
 */
export type WorkspaceFileEnhancementOutcome =
	| {
			creditsUsed: number | null;
			durationMs: number;
			outcome: "success";
			pageCount: number;
			provider: WorkspaceFileExtractionProviderId;
			providerMode: WorkspaceFileExtractionMode;
			routeReason: string;
	  }
	| {
			// Non-null when the provider finished and billed but a later step failed —
			// reporting null there would understate spend on exactly the runs worth
			// investigating.
			creditsUsed: number | null;
			durationMs: number;
			error: unknown;
			outcome: "error";
	  };

export function recordWorkspaceFileExtractionOutcome(input: {
	durationMs: number;
	enhancement: WorkspaceFileEnhancementOutcome;
	instanceId: string;
	liteParse: LiteParseStageOutcome;
	params: WorkspaceFileExtractionWorkflowParams;
	schedule: PostHogTelemetryScheduler;
}) {
	const requestContext = getTelemetryRuntimeContext();

	if (input.params.requestId) {
		requestContext.properties.request_id = input.params.requestId;
	}

	// The run's outcome follows from the two stages: the enhanced pass succeeding is
	// success, failing with a fast projection still published is partial, and failing
	// with nothing readable is an error.
	const outcome =
		input.enhancement.outcome === "success"
			? ("success" as const)
			: input.liteParse.outcome === "success"
				? ("partial" as const)
				: ("error" as const);
	const outcomeFields =
		input.enhancement.outcome === "success"
			? {
					// provider_mode is the tier we asked for; credits_used is what the cost
					// optimizer actually billed, so the two disagree on mixed-complexity files.
					credits_used: input.enhancement.creditsUsed,
					error_type: null,
					page_count: input.enhancement.pageCount,
					provider: input.enhancement.provider,
					provider_mode: input.enhancement.providerMode,
					route_reason: input.enhancement.routeReason,
				}
			: input.liteParse.outcome === "success"
				? {
						credits_used: input.enhancement.creditsUsed,
						error_type: null,
						page_count: input.liteParse.pageCount,
						provider: "liteparse",
						provider_mode: "fast",
						route_reason: "LiteParse projection retained after enhancement failed.",
					}
				: {
						credits_used: input.enhancement.creditsUsed,
						error_type: getErrorType(input.enhancement.error),
						page_count: null,
						provider: null,
						provider_mode: null,
						route_reason: null,
					};
	const fields = {
		actor_user_id: input.params.actorUserId,
		asset_kind: input.params.assetKind,
		duration_ms: input.durationMs,
		item_id: input.params.itemId,
		outcome,
		request_id: input.params.requestId,
		workflow_id: input.instanceId,
		workspace_id: input.params.workspaceId,
		enhancement_error_type:
			input.enhancement.outcome === "error" ? getErrorType(input.enhancement.error) : null,
		enhancement_error_message: null,
		enhancement_outcome: input.enhancement.outcome,
		enhancement_duration_ms: input.enhancement.durationMs,
		liteparse_duration_ms: input.liteParse.durationMs,
		liteparse_error_type: input.liteParse.outcome === "error" ? input.liteParse.errorType : null,
		liteparse_markdown_length:
			input.liteParse.outcome === "success" ? input.liteParse.markdownLength : null,
		liteparse_outcome: input.liteParse.outcome,
		liteparse_page_count: input.liteParse.outcome === "success" ? input.liteParse.pageCount : null,
		...outcomeFields,
	};

	if (input.enhancement.outcome === "error" && outcome === "error") {
		recordOperationalFailure({
			distinctId: input.params.actorUserId ?? undefined,
			error: input.enhancement.error,
			event: "workspace_file_extraction",
			fields,
			requestContext,
			schedule: input.schedule,
		});
	} else {
		logOperationalEvent({
			event: "workspace_file_extraction",
			fields,
			outcome,
			requestContext,
		});
	}

	capturePostHogServerEvent({
		distinctId: input.params.actorUserId ?? input.instanceId,
		event: "workspace_file_extraction_completed",
		// Legitimate interest: operational pipeline telemetry (runs in a Workflow,
		// no request scope). No email/name/content.
		consentExempt: true,
		processPerson: input.params.actorUserId !== null,
		properties: fields,
		requestContext,
		schedule: input.schedule,
	});
}

function getErrorType(error: unknown) {
	return error instanceof Error ? error.name : "UnknownError";
}
