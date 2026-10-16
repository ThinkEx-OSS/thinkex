import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";
import { recordWorkspaceRecordingTranscriptionOutcome } from "#/features/workspaces/recordings/workspace-recording-observability";
import {
	failWorkspaceRecording,
	publishWorkspaceRecordingTranscript,
	readWorkspaceRecordingForTranscription,
} from "#/features/workspaces/recordings/workspace-recording-persistence";
import { buildWorkspaceRecordingTranscript } from "#/features/workspaces/recordings/workspace-recording-timeline";

/** One transcription attempt for an immutable completed recording. */
export interface RecordingTranscriptionWorkflowParams {
	readonly itemId: string;
	readonly attempt: number;
}

/** Stream completed audio to Whisper and publish its time-aligned transcript. */
export class RecordingTranscriptionWorkflow extends WorkflowEntrypoint<
	Cloudflare.Env,
	RecordingTranscriptionWorkflowParams
> {
	async run(
		event: Readonly<WorkflowEvent<RecordingTranscriptionWorkflowParams>>,
		step: WorkflowStep,
	) {
		const { itemId, attempt } = event.payload;
		// Latency is measured from when the workflow event was created, not from
		// this invocation: a resumed run replays completed steps, so an
		// invocation-local start would report only the current attempt's work.
		const startedAt = event.timestamp.getTime();
		// Retained once the recording is read so a later transcription or publish
		// failure still names the workspace; null only when the read itself fails.
		let workspaceId: string | null = null;
		try {
			const recording = await step.do("read recording", () =>
				readWorkspaceRecordingForTranscription(itemId),
			);
			if (recording.status !== "processing" || recording.transcriptionAttempt !== attempt) return;
			workspaceId = recording.workspaceId;
			const transcript = await step.do(
				"transcribe recording",
				{
					retries: { backoff: "exponential", delay: 5_000, limit: 4 },
					timeout: "30 minutes",
				},
				async () => {
					if (!recording.objectKey) throw new Error("Recording audio is missing.");
					const object = await this.env.WORKSPACE_FILES.get(recording.objectKey);
					if (!object) throw new Error("Recording audio is missing.");
					const result = await this.env.AI.run("@cf/openai/whisper-large-v3-turbo", {
						audio: { body: object.body, contentType: recording.mimeType },
						condition_on_previous_text: false,
						task: "transcribe",
						vad_filter: true,
					});
					return buildWorkspaceRecordingTranscript(result, recording.durationMs);
				},
			);
			const published = await step.do("publish transcript", () =>
				publishWorkspaceRecordingTranscript(this.env, { itemId, attempt, transcript }),
			);
			if (published === "applied") {
				await step.do("record transcription success", async () => {
					recordWorkspaceRecordingTranscriptionOutcome({
						attempt,
						durationMs: Date.now() - startedAt,
						instanceId: event.instanceId,
						itemId,
						schedule: (task) => this.ctx.waitUntil(task),
						workspaceId,
					});
					return { recorded: true };
				});
			}
		} catch (error) {
			// Record the failure before marking the row, so a persistence outage
			// that rejects the mark cannot suppress the only structured signal for
			// the transcription failure. The mark still runs and, if it rejects,
			// its error propagates to the workflow retry.
			await step.do("record transcription failure", async () => {
				recordWorkspaceRecordingTranscriptionOutcome({
					attempt,
					durationMs: Date.now() - startedAt,
					error,
					instanceId: event.instanceId,
					itemId,
					schedule: (task) => this.ctx.waitUntil(task),
					workspaceId,
				});
				return { recorded: true };
			});
			await step.do("mark transcription failed", () =>
				failWorkspaceRecording(
					this.env,
					itemId,
					attempt,
					error instanceof Error ? error.message : String(error),
				),
			);
		}
	}
}
