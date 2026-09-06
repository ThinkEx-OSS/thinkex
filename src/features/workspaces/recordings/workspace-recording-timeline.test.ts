import { describe, expect, it } from "vitest";
import { buildWorkspaceRecordingTranscript } from "#/features/workspaces/recordings/workspace-recording-timeline";

describe("recording transcript", () => {
	it("preserves timestamps and language on one audio timeline", () => {
		expect(
			buildWorkspaceRecordingTranscript(
				{
					text: "First Second",
					transcription_info: { language: "en" },
					segments: [
						{ start: 0, text: "First" },
						{ start: 32, text: "Second" },
					],
				},
				40_000,
			),
		).toEqual({
			language: "en",
			cues: [
				{ startMs: 0, text: "First" },
				{ startMs: 32_000, text: "Second" },
			],
		});
	});
	it("keeps cues within audio bounds and ignores empty speech", () => {
		expect(
			buildWorkspaceRecordingTranscript(
				{
					text: "",
					segments: [{ start: -1, text: "First" }, { start: 30, text: "Last" }, { text: " " }],
				},
				30_000,
			).cues,
		).toEqual([
			{ startMs: 0, text: "First" },
			{ startMs: 29_999, text: "Last" },
		]);
		expect(buildWorkspaceRecordingTranscript({ text: " " }, 1_000).cues).toEqual([]);
	});
});
