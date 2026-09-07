import {
	workspaceRecordingStopBytes,
	workspaceRecordingMaxDurationMs,
} from "#/features/workspaces/recordings/workspace-recording";

type Recorder = EventTarget &
	Pick<MediaRecorder, "start" | "stop" | "pause" | "resume" | "state" | "mimeType">;

/** Capture one continuous file. Timeslices collect bytes in memory without restarting or saving. */
export function captureWorkspaceRecording(recorder: Recorder, now = () => performance.now()) {
	const chunks: Blob[] = [];
	let accumulatedMs = 0;
	let startedAt: number | null = null;
	let sizeBytes = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	const elapsedMs = () => accumulatedMs + (startedAt === null ? 0 : now() - startedAt);
	const freezeClock = () => {
		accumulatedMs = elapsedMs();
		startedAt = null;
		clearTimeout(timer);
	};
	const finish = () => {
		if (recorder.state !== "inactive") {
			freezeClock();
			recorder.stop();
		}
	};
	const startClock = () => {
		startedAt = now();
		timer = setTimeout(finish, Math.max(0, workspaceRecordingMaxDurationMs - accumulatedMs));
	};
	recorder.addEventListener("dataavailable", (event) => {
		if ("data" in event && event.data instanceof Blob && event.data.size) {
			chunks.push(event.data);
			sizeBytes += event.data.size;
			if (sizeBytes >= workspaceRecordingStopBytes) finish();
		}
	});
	const completed = new Promise<{ blob: Blob; durationMs: number }>((resolve) => {
		recorder.addEventListener(
			"stop",
			() => {
				freezeClock();
				resolve({
					blob: new Blob(chunks, { type: recorder.mimeType }),
					durationMs: Math.max(1, Math.round(accumulatedMs)),
				});
			},
			{ once: true },
		);
	});
	recorder.start(1_000);
	startClock();
	return {
		completed,
		elapsedMs,
		finish,
		pause: () => {
			if (recorder.state === "recording") {
				recorder.pause();
				freezeClock();
			}
		},
		resume: () => {
			if (recorder.state === "paused") {
				recorder.resume();
				startClock();
			}
		},
	};
}
