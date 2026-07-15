import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { uploadFileDirectlyToR2 } from "#/features/workspaces/upload/workspace-file-direct-upload-client";

const requests: FakeXmlHttpRequest[] = [];

beforeAll(() => {
	vi.stubGlobal("XMLHttpRequest", FakeXmlHttpRequest);
});

beforeEach(() => {
	requests.length = 0;
});

describe("direct R2 upload client", () => {
	it("reports byte progress and resolves a successful PUT", async () => {
		const progress = vi.fn();
		const promise = uploadFileDirectlyToR2({
			contentType: "application/pdf",
			file: new File([new Uint8Array([1, 2, 3])], "paper.pdf"),
			onProgress: progress,
			signal: new AbortController().signal,
			url: "https://r2.example/upload",
		});
		const request = requests[0]!;

		request.upload.onprogress?.({ loaded: 2 } as ProgressEvent);
		request.complete(200);

		await expect(promise).resolves.toBeUndefined();
		expect(progress.mock.calls).toEqual([[2], [3]]);
		expect(request.method).toBe("PUT");
		expect(request.headers.get("content-type")).toBe("application/pdf");
	});

	it("aborts the active request when the batch is canceled", async () => {
		const controller = new AbortController();
		const promise = uploadFileDirectlyToR2({
			contentType: "image/png",
			file: new File([new Uint8Array([1])], "image.png"),
			onProgress: vi.fn(),
			signal: controller.signal,
			url: "https://r2.example/upload",
		});

		controller.abort(new DOMException("Upload canceled.", "AbortError"));

		await expect(promise).rejects.toMatchObject({ name: "AbortError" });
		expect(requests[0]?.aborted).toBe(true);
	});

	it("rejects a failed R2 response", async () => {
		const promise = uploadFileDirectlyToR2({
			contentType: "image/png",
			file: new File([new Uint8Array([1])], "image.png"),
			onProgress: vi.fn(),
			signal: new AbortController().signal,
			url: "https://r2.example/upload",
		});

		requests[0]?.complete(403);

		await expect(promise).rejects.toThrow("status 403");
	});
});

class FakeXmlHttpRequest {
	aborted = false;
	headers = new Headers();
	method = "";
	onabort: (() => void) | null = null;
	onerror: (() => void) | null = null;
	onload: (() => void) | null = null;
	ontimeout: (() => void) | null = null;
	status = 0;
	timeout = 0;
	upload = { onprogress: null as ((event: ProgressEvent) => void) | null };

	constructor() {
		requests.push(this);
	}

	abort() {
		this.aborted = true;
		this.onabort?.();
	}

	complete(status: number) {
		this.status = status;
		this.onload?.();
	}

	open(method: string) {
		this.method = method;
	}

	send() {}

	setRequestHeader(name: string, value: string) {
		this.headers.set(name, value);
	}
}
