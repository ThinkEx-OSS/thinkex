import { describe, expect, it } from "vitest";

import { parseWorkspaceRecordingManifest } from "#/features/workspaces/recordings/workspace-recording";

describe("workspace recording manifest", () => {
	it("accepts one contiguous segment sequence", () => {
		expect(
			parseWorkspaceRecordingManifest({
				expectedSegmentCount: 2,
				segments: [
					{ durationMs: 30_000, sequence: 0, sizeBytes: 240_000 },
					{ durationMs: 12_000, sequence: 1, sizeBytes: 96_000 },
				],
			}),
		).toEqual({ ok: true, durationMs: 42_000, sizeBytes: 336_000 });
	});

	it("rejects gaps even when the count matches", () => {
		expect(
			parseWorkspaceRecordingManifest({
				expectedSegmentCount: 2,
				segments: [
					{ durationMs: 30_000, sequence: 0, sizeBytes: 240_000 },
					{ durationMs: 30_000, sequence: 2, sizeBytes: 240_000 },
				],
			}),
		).toMatchObject({ ok: false, code: "incomplete" });
	});

	it("rejects an empty recording", () => {
		expect(
			parseWorkspaceRecordingManifest({ expectedSegmentCount: 0, segments: [] }),
		).toMatchObject({ ok: false, code: "empty" });
	});
});
