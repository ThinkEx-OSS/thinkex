export interface WorkspaceRecordingSegmentTranscript {
	readonly durationMs: number;
	readonly sequence: number;
	readonly text: string;
	readonly timedLines: readonly { readonly startSeconds: number; readonly text: string }[];
}

/** Resolve an absolute recording timestamp to its stored segment. */
export function getWorkspaceRecordingSegmentAtTime(
	segments: readonly { readonly durationMs: number; readonly sequence: number }[],
	targetMs: number,
) {
	let elapsed = 0;
	for (const segment of segments) {
		if (targetMs < elapsed + segment.durationMs) return segment.sequence;
		elapsed += segment.durationMs;
	}
	return segments.at(-1)?.sequence ?? 0;
}

/** Convert segment-relative model timestamps into one absolute recording timeline. */
export function buildWorkspaceRecordingTranscript(
	segments: readonly WorkspaceRecordingSegmentTranscript[],
) {
	let offsetSeconds = 0;
	const cues: Array<{
		segmentSequence: number;
		startMs: number;
		text: string;
	}> = [];
	for (const segment of segments) {
		const segmentDurationSeconds = segment.durationMs / 1_000;
		if (segment.timedLines.length > 0) {
			for (const line of segment.timedLines) {
				const startSeconds = Math.min(segmentDurationSeconds, Math.max(0, line.startSeconds));
				cues.push({
					segmentSequence: segment.sequence,
					startMs: Math.round((offsetSeconds + startSeconds) * 1_000),
					text: line.text,
				});
			}
		} else if (segment.text) {
			cues.push({
				segmentSequence: segment.sequence,
				startMs: Math.round(offsetSeconds * 1_000),
				text: segment.text,
			});
		}
		offsetSeconds += segmentDurationSeconds;
	}
	return { cues };
}
