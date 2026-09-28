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
		const startedAt = Date.now();
		try {
			const recording = await step.do("read recording", () =>
				readWorkspaceRecordingForTranscription(itemId),
			);
			if (recording.status !== "processing" || recording.transcriptionAttempt !== attempt) return;
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
						workspaceId: recording.workspaceId,
					});
					return { recorded: true };
				});
			}
		} catch (error) {
			await step.do("mark transcription failed", () =>
				failWorkspaceRecording(
					this.env,
					itemId,
					attempt,
					error instanceof Error ? error.message : String(error),
				),
			);
			await step.do("record transcription failure", async () => {
				recordWorkspaceRecordingTranscriptionOutcome({
					attempt,
					durationMs: Date.now() - startedAt,
					error,
					instanceId: event.instanceId,
					itemId,
					schedule: (task) => this.ctx.waitUntil(task),
					workspaceId: null,
				});
				return { recorded: true };
			});
		}
	}
}
