import { recordOperationalOutcome } from "#/integrations/observability/operational-events";
import type { PostHogTelemetryScheduler } from "#/integrations/posthog/scheduler";

/**
 * Records the settled outcome of one transcription run. The workflow marks a
 * failed recording in the database but settles the run without surfacing it,
 * so this is the only signal an operator has: a success carries the run's
 * end-to-end latency since the workflow event was created, a failure carries
 * the error, and both carry the item, attempt, workspace, and workflow id so a
 * stuck or repeatedly failing recording is traceable from the event back to its
 * row.
 */
export function recordWorkspaceRecordingTranscriptionOutcome(input: {
	attempt: number;
	durationMs: number;
	error?: unknown;
	instanceId: string;
	itemId: string;
	schedule: PostHogTelemetryScheduler;
	workspaceId: string | null;
}) {
	recordOperationalOutcome({
		error: input.error,
		event: "recording_transcription",
		fields: {
			attempt: input.attempt,
			duration_ms: input.durationMs,
			item_id: input.itemId,
			workflow_id: input.instanceId,
			workspace_id: input.workspaceId,
		},
		schedule: input.schedule,
	});
}
