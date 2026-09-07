import { afterEach, describe, expect, it, vi } from "vitest";
import { captureWorkspaceRecording } from "#/features/workspaces/recordings/workspace-recording-capture";

class Recorder extends EventTarget {
	state: RecordingState = "inactive";
	mimeType = "audio/webm";
	starts = 0;
	start() {
		this.state = "recording";
		this.starts++;
	}
	pause() {
		this.state = "paused";
	}
	resume() {
		this.state = "recording";
	}
	stop() {
		this.state = "inactive";
	}
	data(text: string) {
		this.dispatchEvent(Object.assign(new Event("dataavailable"), { data: new Blob([text]) }));
	}
	complete() {
		this.dispatchEvent(new Event("stop"));
	}
}

afterEach(() => vi.useRealTimers());
describe("continuous recording", () => {
	it("keeps one recorder through pauses and returns all audio only after the final event", async () => {
		vi.useFakeTimers();
		const recorder = new Recorder();
		let time = 0;
		const completed: { blob: Blob; durationMs: number }[] = [];
		const capture = captureWorkspaceRecording(
			recorder,
			(audio) => {
				completed.push(audio);
			},
			() => time,
		);
		recorder.data("first");
		time = 45_000;
		expect(completed).toEqual([]);
		capture.pause();
		time += 60_000;
		capture.resume();
		time += 10_000;
		void capture.finish();
		void capture.finish(); // Navigation cleanup before the final data/stop events.
		expect(completed).toEqual([]);
		recorder.data("last");
		recorder.complete();
		expect(recorder.starts).toBe(1);
		expect(completed[0]?.durationMs).toBe(55_000);
		expect(await completed[0]?.blob.text()).toBe("firstlast");
	});
	it("saves all bytes when the active-time limit stops capture, even if cleanup also finishes", () => {
		vi.useFakeTimers();
		const recorder = new Recorder();
		let time = 10_000;
		const completed: Blob[] = [];
		const capture = captureWorkspaceRecording(
			recorder,
			(audio) => {
				completed.push(audio.blob);
			},
			() => time,
		);
		time += 3 * 60 * 60 * 1_000 - 1;
		capture.pause();
		capture.resume();
		vi.advanceTimersByTime(1);
		expect(recorder.state).toBe("inactive");
		void capture.finish();
		recorder.data("last");
		recorder.complete();
		expect(completed[0]?.size).toBe(4);
	});
	it("stops at the size limit without discarding the final container bytes", async () => {
		vi.useFakeTimers();
		const recorder = new Recorder();
		const completed: Blob[] = [];
		captureWorkspaceRecording(recorder, (audio) => {
			completed.push(audio.blob);
		});
		const megabyte = new Blob([new Uint8Array(1024 * 1024)]);
		const data = new Blob(Array.from({ length: 88 }, () => megabyte));
		recorder.dispatchEvent(Object.assign(new Event("dataavailable"), { data }));
		expect(recorder.state).toBe("inactive");
		recorder.data("tail");
		recorder.complete();
		expect(completed[0]?.size).toBe(data.size + 4);
		expect(await completed[0]?.slice(-4).text()).toBe("tail");
	});

	it("waits for completed audio persistence before allowing navigation", async () => {
		vi.useFakeTimers();
		const recorder = new Recorder();
		let saved = () => {};
		const persistence = new Promise<void>((resolve) => {
			saved = resolve;
		});
		const capture = captureWorkspaceRecording(recorder, () => persistence);
		let finished = false;
		const completion = capture.finish().then(() => {
			finished = true;
		});
		recorder.data("audio");
		recorder.complete();
		await Promise.resolve();
		expect(finished).toBe(false);
		saved();
		await completion;
		expect(finished).toBe(true);
	});

	it("completes an empty recording instead of leaving Done pending", () => {
		vi.useFakeTimers();
		const recorder = new Recorder();
		const completed: Blob[] = [];
		const capture = captureWorkspaceRecording(recorder, (audio) => {
			completed.push(audio.blob);
		});
		void capture.finish();
		recorder.complete();
		expect(completed[0]?.size).toBe(0);
	});
});
