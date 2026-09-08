import { describe, expect, it } from "vitest";
import {
	canCaptureWorkspaceRecording,
	scaleRecordingWaveformAmplitude,
} from "#/features/workspaces/recordings/workspace-recording";

describe("workspace recording waveform", () => {
	it("makes normal speaking volume clearly visible", () => {
		expect(scaleRecordingWaveformAmplitude(0.005)).toBe(0);
		expect(scaleRecordingWaveformAmplitude(0.04)).toBeGreaterThanOrEqual(0.35);
	});
});

describe("recording private trial", () => {
	it("allows only the designated account", () => {
		expect(canCaptureWorkspaceRecording("ooTflUkWpCSkxoaJMD1P8plVDWmhiA1w")).toBe(true);
		expect(canCaptureWorkspaceRecording("another-user")).toBe(false);
		expect(canCaptureWorkspaceRecording(undefined)).toBe(false);
	});
});
