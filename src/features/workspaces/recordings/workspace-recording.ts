/** Private production trial; only the designated tester can start new recordings. */
export function canCaptureWorkspaceRecording(userId: string | undefined) {
	return userId === "ooTflUkWpCSkxoaJMD1P8plVDWmhiA1w";
}

/** Automatically stop after this much active capture; browser timers may fire late. */
export const workspaceRecordingMaxDurationMs = 3 * 60 * 60 * 1_000;

/** Maximum encoded size for one completed audio file. */
export const workspaceRecordingMaxBytes = 96 * 1_024 * 1_024;

/** Leave 8 MiB for delayed chunks and final container metadata; final size is still checked. */
export const workspaceRecordingStopBytes = workspaceRecordingMaxBytes - 8 * 1_024 * 1_024;

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
