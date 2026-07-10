import type {
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
	params: WorkspaceFileExtractionWorkflowParams;
	schedule: PostHogTelemetryScheduler;
}

type WorkspaceFileExtractionOutcome = WorkspaceFileExtractionOutcomeBase &
	(
		| {
				error: unknown;
				outcome: "error";
		  }
		| {
				outcome: "success";
				pageCount: number;
				provider: MarkdownExtractionProviderId;
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
		input.outcome === "success"
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
			outcome: "success",
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
