import { describe, expect, it } from "vitest";

import {
	easeRecordingWaveformAmplitude,
	parseWorkspaceRecordingManifest,
	scaleRecordingWaveformAmplitude,
} from "#/features/workspaces/recordings/workspace-recording";
import { getWorkspaceRecordingSegmentAtTime } from "#/features/workspaces/recordings/workspace-recording-timeline";

describe("workspace recording manifest", () => {
	it("accepts one contiguous segment sequence", () => {
		expect(
			parseWorkspaceRecordingManifest({
				expectedSegmentCount: 2,
				segments: [
					{ durationMs: 30_000, sequence: 0 },
					{ durationMs: 12_000, sequence: 1 },
				],
			}),
		).toEqual({ ok: true, durationMs: 42_000 });
	});

	it("rejects gaps even when the count matches", () => {
		expect(
			parseWorkspaceRecordingManifest({
				expectedSegmentCount: 2,
				segments: [
					{ durationMs: 30_000, sequence: 0 },
					{ durationMs: 30_000, sequence: 2 },
				],
			}),
		).toEqual({ ok: false, message: "Some recording segments have not finished uploading yet." });
	});

	it("rejects an empty recording", () => {
		expect(parseWorkspaceRecordingManifest({ expectedSegmentCount: 0, segments: [] })).toEqual({
			ok: false,
			message: "Record at least one segment before finishing.",
		});
	});
});

describe("workspace recording playback", () => {
	const segments = [
		{ durationMs: 30_000, sequence: 0 },
		{ durationMs: 12_000, sequence: 1 },
	];

	it("maps absolute timestamps across stored segments", () => {
		expect(getWorkspaceRecordingSegmentAtTime(segments, 29_999)).toBe(0);
		expect(getWorkspaceRecordingSegmentAtTime(segments, 30_000)).toBe(1);
		expect(getWorkspaceRecordingSegmentAtTime(segments, 42_000)).toBe(1);
	});
});

describe("workspace recording waveform", () => {
	it("makes normal speaking volume clearly visible", () => {
		expect(scaleRecordingWaveformAmplitude(0.005)).toBe(0);
		expect(scaleRecordingWaveformAmplitude(0.04)).toBeGreaterThanOrEqual(0.35);
	});

	it("eases bars into and out of speech", () => {
		const rising = easeRecordingWaveformAmplitude(0, 1, 16);
		const falling = easeRecordingWaveformAmplitude(1, 0, 16);
		expect(rising).toBeGreaterThan(0);
		expect(rising).toBeLessThan(1);
		expect(falling).toBeGreaterThan(0);
		expect(falling).toBeLessThan(1);
		expect(rising).toBeGreaterThan(1 - falling);
	});
});
