/** Maximum accepted duration for one lecture recording. */
export const workspaceRecordingMaxDurationMs = 3 * 60 * 60 * 1_000;

/** Maximum encoded size for one independently playable recording segment. */
export const workspaceRecordingMaxSegmentBytes = 4 * 1_024 * 1_024;

/** Target duration for independently playable browser recording segments. */
export const workspaceRecordingSegmentDurationMs = 30_000;

/** A persisted segment used to validate a recording before transcription. */
export interface WorkspaceRecordingSegmentManifestEntry {
	readonly durationMs: number;
	readonly sequence: number;
	readonly sizeBytes: number;
}

export type WorkspaceRecordingManifestResult =
	| { readonly ok: true; readonly durationMs: number; readonly sizeBytes: number }
	| {
			readonly ok: false;
			readonly code: "empty" | "incomplete" | "too_long";
			readonly message: string;
	  };

/** Verify that a finalized recording contains exactly one contiguous segment sequence. */
export function parseWorkspaceRecordingManifest(input: {
	readonly expectedSegmentCount: number;
	readonly segments: readonly WorkspaceRecordingSegmentManifestEntry[];
}): WorkspaceRecordingManifestResult {
	if (input.expectedSegmentCount < 1) {
		return { ok: false, code: "empty", message: "Record at least one segment before finishing." };
	}

	if (input.segments.length !== input.expectedSegmentCount) {
		return {
			ok: false,
			code: "incomplete",
			message: "Some recording segments have not finished uploading yet.",
		};
	}

	let durationMs = 0;
	let sizeBytes = 0;
	for (let sequence = 0; sequence < input.segments.length; sequence += 1) {
		const segment = input.segments[sequence];
		if (!segment || segment.sequence !== sequence) {
			return {
				ok: false,
				code: "incomplete",
				message: "Some recording segments have not finished uploading yet.",
			};
		}
		durationMs += segment.durationMs;
		sizeBytes += segment.sizeBytes;
	}

	if (durationMs > workspaceRecordingMaxDurationMs) {
		return {
			ok: false,
			code: "too_long",
			message: "Recordings can be up to 3 hours long.",
		};
	}

	return { ok: true, durationMs, sizeBytes };
}
