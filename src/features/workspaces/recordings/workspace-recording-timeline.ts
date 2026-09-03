export interface WorkspaceRecordingSegmentTranscript {
	readonly durationMs: number;
	readonly sequence: number;
	readonly text: string;
	readonly timedLines: readonly { readonly startSeconds: number; readonly text: string }[];
}

/** Convert segment-relative model timestamps into one absolute recording timeline. */
export function buildWorkspaceRecordingTranscript(
	segments: readonly WorkspaceRecordingSegmentTranscript[],
) {
	let offsetSeconds = 0;
	const cues: Array<{
		endMs: number;
		segmentSequence: number;
		startMs: number;
		text: string;
	}> = [];
	for (const segment of segments) {
		const segmentDurationSeconds = segment.durationMs / 1_000;
		if (segment.timedLines.length > 0) {
			for (const [index, line] of segment.timedLines.entries()) {
				const nextLine = segment.timedLines[index + 1];
				const startSeconds = Math.min(segmentDurationSeconds, Math.max(0, line.startSeconds));
				const endSeconds = Math.max(
					startSeconds,
					Math.min(segmentDurationSeconds, nextLine?.startSeconds ?? segmentDurationSeconds),
				);
				cues.push({
					endMs: Math.round((offsetSeconds + endSeconds) * 1_000),
					segmentSequence: segment.sequence,
					startMs: Math.round((offsetSeconds + startSeconds) * 1_000),
					text: line.text,
				});
			}
		} else if (segment.text) {
			cues.push({
				endMs: Math.round((offsetSeconds + segmentDurationSeconds) * 1_000),
				segmentSequence: segment.sequence,
				startMs: Math.round(offsetSeconds * 1_000),
				text: segment.text,
			});
		}
		offsetSeconds += segmentDurationSeconds;
	}
	return { cues };
}
