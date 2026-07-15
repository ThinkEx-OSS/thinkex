const directUploadTimeoutMs = 20 * 60_000;

export function uploadFileDirectlyToR2(input: {
	contentType: string;
	file: File;
	onProgress: (loadedBytes: number) => void;
	signal: AbortSignal;
	url: string;
}) {
	return new Promise<void>((resolve, reject) => {
		if (input.signal.aborted) {
			reject(getWorkspaceUploadAbortReason(input.signal));
			return;
		}

		const request = new XMLHttpRequest();
		const abort = () => request.abort();
		const cleanup = () => input.signal.removeEventListener("abort", abort);

		request.open("PUT", input.url);
		request.setRequestHeader("content-type", input.contentType);
		request.timeout = directUploadTimeoutMs;
		request.upload.onprogress = (event) => input.onProgress(event.loaded);
		request.onload = () => {
			cleanup();
			if (request.status >= 200 && request.status < 300) {
				input.onProgress(input.file.size);
				resolve();
				return;
			}
			reject(new Error(`Direct file upload failed with status ${request.status}.`));
		};
		request.onerror = () => {
			cleanup();
			reject(new Error("Direct file upload failed because of a network error."));
		};
		request.ontimeout = () => {
			cleanup();
			reject(new Error("Direct file upload timed out."));
		};
		request.onabort = () => {
			cleanup();
			reject(getWorkspaceUploadAbortReason(input.signal));
		};

		input.signal.addEventListener("abort", abort, { once: true });
		request.send(input.file);
	});
}

export function getWorkspaceUploadAbortReason(signal: AbortSignal) {
	return signal.reason instanceof Error
		? signal.reason
		: new DOMException("Upload canceled.", "AbortError");
}
