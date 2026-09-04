/** Maximum accepted duration for one recording. */
export const workspaceRecordingMaxDurationMs = 3 * 60 * 60 * 1_000;

/** Maximum encoded size for one independently playable recording segment. */
export const workspaceRecordingMaxSegmentBytes = 4 * 1_024 * 1_024;

/** Map microphone amplitude to the portion of waveform height used on screen. */
export function scaleRecordingWaveformAmplitude(amplitude: number) {
	return Math.min(1, Math.sqrt(Math.max(0, amplitude - 0.008) * 5));
}

/** Move one displayed waveform bar toward its latest microphone sample. */
export function easeRecordingWaveformAmplitude(
	current: number,
	target: number,
	elapsedMs = 1000 / 60,
) {
	const responseMs = target > current ? 85 : 220;
	return current + (target - current) * (1 - Math.exp(-elapsedMs / responseMs));
}

/** Verify that a finalized recording contains exactly one contiguous segment sequence. */
export function parseWorkspaceRecordingManifest(input: {
	readonly expectedSegmentCount: number;
	readonly segments: readonly { readonly durationMs: number; readonly sequence: number }[];
}) {
	if (input.expectedSegmentCount < 1) {
		return { ok: false, message: "Record at least one segment before finishing." } as const;
	}

	if (input.segments.length !== input.expectedSegmentCount) {
		return {
			ok: false as const,
			message: "Some recording segments have not finished uploading yet.",
		};
	}

	let durationMs = 0;
	for (let sequence = 0; sequence < input.segments.length; sequence += 1) {
		const segment = input.segments[sequence];
		if (!segment || segment.sequence !== sequence) {
			return {
				ok: false as const,
				message: "Some recording segments have not finished uploading yet.",
			};
		}
		durationMs += segment.durationMs;
	}

	if (durationMs > workspaceRecordingMaxDurationMs) {
		return {
			ok: false as const,
			message: "Recordings can be up to 3 hours long.",
		};
	}

	return { ok: true, durationMs } as const;
}
