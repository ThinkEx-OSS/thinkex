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
	it("returns one complete file through pause, resume, and repeated stops", async () => {
		vi.useFakeTimers();
		const recorder = new Recorder();
		let time = 0;
		const capture = captureWorkspaceRecording(recorder, () => time);
		recorder.data("first");
		time = 45_000;
		capture.pause();
		time += 60_000;
		capture.resume();
		time += 10_000;
		capture.finish();
		capture.finish();
		recorder.data("last");
		recorder.complete();
		const audio = await capture.completed;
		expect(recorder.starts).toBe(1);
		expect(audio.durationMs).toBe(55_000);
		expect(await audio.blob.text()).toBe("firstlast");
	});
	it("auto-stops using remaining active time and retains the final event", async () => {
		vi.useFakeTimers();
		const recorder = new Recorder();
		let time = 10_000;
		const capture = captureWorkspaceRecording(recorder, () => time);
		time += 3 * 60 * 60 * 1_000 - 1;
		capture.pause();
		capture.resume();
		vi.advanceTimersByTime(1);
		expect(recorder.state).toBe("inactive");
		capture.finish();
		recorder.data("last");
		recorder.complete();
		expect(await (await capture.completed).blob.text()).toBe("last");
	});
	it("leaves upload headroom without discarding final container bytes", async () => {
		vi.useFakeTimers();
		const recorder = new Recorder();
		const capture = captureWorkspaceRecording(recorder);
		const megabyte = new Blob([new Uint8Array(1024 * 1024)]);
		const data = new Blob(Array.from({ length: 88 }, () => megabyte));
		recorder.dispatchEvent(Object.assign(new Event("dataavailable"), { data }));
		expect(recorder.state).toBe("inactive");
		recorder.data("tail");
		recorder.complete();
		const { blob } = await capture.completed;
		expect(blob.size).toBe(data.size + 4);
		expect(await blob.slice(-4).text()).toBe("tail");
	});
	it("returns empty audio without leaving completion pending", async () => {
		vi.useFakeTimers();
		const recorder = new Recorder();
		const capture = captureWorkspaceRecording(recorder);
		capture.finish();
		recorder.complete();
		expect((await capture.completed).blob.size).toBe(0);
	});
});
