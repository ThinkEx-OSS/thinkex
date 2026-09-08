import { describe, expect, it } from "vitest";
import { scaleRecordingWaveformAmplitude } from "#/features/workspaces/recordings/workspace-recording";

describe("workspace recording waveform", () => {
	it("makes normal speaking volume clearly visible", () => {
		expect(scaleRecordingWaveformAmplitude(0.005)).toBe(0);
		expect(scaleRecordingWaveformAmplitude(0.04)).toBeGreaterThanOrEqual(0.35);
	});
});
