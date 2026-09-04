import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import {
	failWorkspaceRecording,
	publishWorkspaceRecordingTranscript,
	readWorkspaceRecordingForTranscription,
} from "#/features/workspaces/recordings/workspace-recording-persistence";
import {
	buildWorkspaceRecordingTranscript,
	type WorkspaceRecordingSegmentTranscript,
} from "#/features/workspaces/recordings/workspace-recording-timeline";

/** Durable payload for one finalized recording. */
export interface RecordingTranscriptionWorkflowParams {
	readonly itemId: string;
}

/** Transcribe independently playable recording segments and publish one workspace document. */
export class RecordingTranscriptionWorkflow extends WorkflowEntrypoint<
	Cloudflare.Env,
	RecordingTranscriptionWorkflowParams
> {
	async run(
		event: Readonly<WorkflowEvent<RecordingTranscriptionWorkflowParams>>,
		step: WorkflowStep,
	) {
		const itemId = event.payload.itemId;
		if (!itemId) {
			throw new Error("Invalid recording transcription payload.");
		}

		try {
			const manifest = await step.do("read recording manifest", async () => {
				const { recording, segments } = await readWorkspaceRecordingForTranscription(itemId);
				if (recording.status === "ready") {
					return { alreadyReady: true as const, segments: [] };
				}
				if (
					recording.status !== "processing" ||
					recording.expectedSegmentCount !== segments.length
				) {
					throw new Error("Recording manifest is not ready for transcription.");
				}
				return {
					alreadyReady: false as const,
					segments: segments.map((segment) => ({
						durationMs: segment.durationMs,
						mimeType: segment.mimeType,
						objectKey: segment.objectKey,
						sequence: segment.sequence,
					})),
				};
			});
			if (manifest.alreadyReady) {
				return { status: "ready" as const };
			}

			const transcripts: WorkspaceRecordingSegmentTranscript[] = [];
			for (const segment of manifest.segments) {
				const transcript = await step.do(
					`transcribe segment ${segment.sequence}`,
					{
						retries: { backoff: "exponential", delay: 5_000, limit: 4 },
						timeout: 5 * 60_000,
					},
					async (): Promise<WorkspaceRecordingSegmentTranscript> => {
						const object = await this.env.WORKSPACE_FILES.get(segment.objectKey);
						if (!object) {
							throw new Error(`Recording segment ${segment.sequence} is missing.`);
						}
						const audio = encodeBase64(new Uint8Array(await object.arrayBuffer()));
						const result = await this.env.AI.run("@cf/openai/whisper-large-v3-turbo", {
							audio,
							condition_on_previous_text: false,
							task: "transcribe",
							vad_filter: true,
						});
						return {
							durationMs: segment.durationMs,
							sequence: segment.sequence,
							text: result.text.trim(),
							timedLines: (result.segments ?? []).flatMap((part) => {
								const text = part.text?.trim();
								return text ? [{ startSeconds: Math.max(0, part.start ?? 0), text }] : [];
							}),
						};
					},
				);
				transcripts.push(transcript);
			}

			const transcript = buildWorkspaceRecordingTranscript(transcripts);
			const outcome = await step.do("publish recording transcript", async () => {
				return publishWorkspaceRecordingTranscript(this.env, {
					itemId,
					transcript,
				});
			});

			return { outcome, status: "ready" as const };
		} catch (error) {
			await step.do("mark transcription failed", async () => {
				await failWorkspaceRecording(this.env, itemId, getErrorMessage(error));
				return { failed: true };
			});
			return { error: getErrorMessage(error), status: "failed" as const };
		}
	}
}

function encodeBase64(bytes: Uint8Array) {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}
