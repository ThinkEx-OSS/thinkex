import type {
	LiteParseStageOutcome,
	MarkdownExtractionProviderId,
	MarkdownExtractionProviderMode,
	WorkspaceFileExtractionWorkflowParams,
} from "#/features/workspaces/extraction/types";
import {
	logOperationalEvent,
	recordOperationalFailure,
} from "#/integrations/observability/operational-events";
import { capturePostHogServerEvent } from "#/integrations/posthog/server";
import { getTelemetryRuntimeContext } from "#/integrations/posthog/server-context";
import type { PostHogTelemetryScheduler } from "#/integrations/posthog/scheduler";

interface WorkspaceFileExtractionOutcomeBase {
	durationMs: number;
	instanceId: string;
	liteParse: LiteParseStageOutcome;
	params: WorkspaceFileExtractionWorkflowParams;
	schedule: PostHogTelemetryScheduler;
	enhancement:
		| { durationMs: number; outcome: "success" }
		| { durationMs: number; error: unknown; outcome: "error" };
}

type WorkspaceFileExtractionOutcome = WorkspaceFileExtractionOutcomeBase &
	(
		| {
				error: unknown;
				outcome: "error";
		  }
		| {
				outcome: "partial" | "success";
				pageCount: number;
				provider: MarkdownExtractionProviderId | "liteparse";
				providerMode: MarkdownExtractionProviderMode;
				routeReason: string;
		  }
	);

export function recordWorkspaceFileExtractionOutcome(input: WorkspaceFileExtractionOutcome) {
	const requestContext = getTelemetryRuntimeContext();

	if (input.params.requestId) {
		requestContext.properties.request_id = input.params.requestId;
	}

	const outcomeFields =
		input.outcome !== "error"
			? {
					error_type: null,
					page_count: input.pageCount,
					provider: input.provider,
					provider_mode: input.providerMode,
					route_reason: input.routeReason,
				}
			: {
					error_type: input.error instanceof Error ? input.error.name : "UnknownError",
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
		outcome: input.outcome,
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

	if (input.outcome === "error") {
		recordOperationalFailure({
			distinctId: input.params.actorUserId ?? undefined,
			error: input.error,
			event: "workspace_file_extraction",
			fields,
			requestContext,
			schedule: input.schedule,
		});
	} else {
		logOperationalEvent({
			event: "workspace_file_extraction",
			fields,
			outcome: input.outcome,
			requestContext,
		});
	}

	capturePostHogServerEvent({
		distinctId: input.params.actorUserId ?? input.instanceId,
		event: "workspace_file_extraction_completed",
		properties: fields,
		requestContext,
		schedule: input.schedule,
	});
}

function getErrorType(error: unknown) {
	return error instanceof Error ? error.name : "UnknownError";
}
