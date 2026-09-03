import type { WorkspaceItem } from "#/features/workspaces/contracts";
import type { WorkspaceRecordingTranscript } from "#/features/workspaces/recordings/workspace-recording-transcript";
import type {
	LocalWorkspaceRecording,
	LocalWorkspaceRecordingSegment,
} from "#/features/workspaces/recordings/workspace-recording-local-store";

export interface WorkspaceRecordingSnapshot {
	readonly item: WorkspaceItem;
	readonly mimeType: string;
	readonly status: "recording" | "processing" | "ready" | "failed";
	readonly durationMs: number;
	readonly errorMessage: string | null;
	readonly receivedSequences: readonly number[];
	readonly segments: readonly { durationMs: number; sequence: number; sizeBytes: number }[];
	readonly transcript: WorkspaceRecordingTranscript;
}

/** Pick the first independently playable MediaRecorder format this browser supports. */
export function getSupportedRecordingMimeType() {
	if (typeof MediaRecorder === "undefined") return null;
	return (
		["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4"].find((type) =>
			MediaRecorder.isTypeSupported(type),
		) ?? null
	);
}

/** Create the durable workspace item before capturing microphone audio. */
export async function createRecordingItem(input: {
	workspaceId: string;
	parentId: string | null;
	name: string;
	mimeType: string;
}) {
	return requestRecordingJson<WorkspaceRecordingSnapshot & { revision: number }>(
		`/api/v1/workspaces/${input.workspaceId}/recordings`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(input),
		},
	);
}

/** Upload one locally durable segment; retries are safe by sequence number. */
export async function uploadRecordingSegment(segment: LocalWorkspaceRecordingSegment) {
	await requestRecordingJson(
		`/api/v1/workspaces/${segment.workspaceId}/recordings/${segment.itemId}/segments/${segment.sequence}`,
		{
			method: "PUT",
			headers: {
				"content-type": segment.mimeType,
				"x-recording-duration-ms": String(Math.round(segment.durationMs)),
				"x-recording-size-bytes": String(segment.blob.size),
			},
			body: segment.blob,
		},
	);
}

/** Lock the contiguous segment set and enqueue durable transcription. */
export async function finalizeRecording(recording: LocalWorkspaceRecording) {
	await requestRecordingJson(
		`/api/v1/workspaces/${recording.workspaceId}/recordings/${recording.itemId}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ expectedSegmentCount: recording.segmentCount }),
		},
	);
}

/** Read playback, upload, and transcript state for a recording item. */
export async function getRecording(workspaceId: string, itemId: string) {
	return requestRecordingJson<WorkspaceRecordingSnapshot>(
		`/api/v1/workspaces/${workspaceId}/recordings/${itemId}`,
	);
}

function asyncErrorMessage(value: unknown) {
	if (typeof value !== "object" || value === null || !("message" in value)) return null;
	return typeof value.message === "string" ? value.message : null;
}

async function requestRecordingJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
	const response = await fetch(url, init);
	if (!response.ok) {
		const body: unknown = await response.json().catch(() => null);
		throw new Error(asyncErrorMessage(body) ?? "Recording request failed.");
	}
	return (await response.json()) as T;
}
