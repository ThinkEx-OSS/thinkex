import { describe, expect, it } from "vitest";

import { buildWorkspaceRecordingTranscript } from "#/features/workspaces/recordings/workspace-recording-timeline";

describe("lecture transcription timeline", () => {
	it("turns segment-relative timestamps into absolute clickable cues", () => {
		expect(
			buildWorkspaceRecordingTranscript([
				{
					durationMs: 30_000,
					sequence: 0,
					text: "First Second",
					timedLines: [
						{ startSeconds: 0, text: "First" },
						{ startSeconds: 12, text: "Second" },
					],
				},
				{
					durationMs: 9_000,
					sequence: 1,
					text: "Third",
					timedLines: [{ startSeconds: 2, text: "Third" }],
				},
			]),
		).toEqual({
			cues: [
				{ segmentSequence: 0, startMs: 0, text: "First" },
				{ segmentSequence: 0, startMs: 12_000, text: "Second" },
				{ segmentSequence: 1, startMs: 32_000, text: "Third" },
			],
		});
	});
});
