import { describe, expect, it } from "vitest";
import {
	canCaptureWorkspaceRecording,
	easeRecordingWaveformAmplitude,
	scaleRecordingWaveformAmplitude,
} from "#/features/workspaces/recordings/workspace-recording";

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

describe("recording private trial", () => {
	it("allows only the designated account", () => {
		expect(canCaptureWorkspaceRecording("ooTflUkWpCSkxoaJMD1P8plVDWmhiA1w")).toBe(true);
		expect(canCaptureWorkspaceRecording("another-user")).toBe(false);
		expect(canCaptureWorkspaceRecording(undefined)).toBe(false);
	});
});
