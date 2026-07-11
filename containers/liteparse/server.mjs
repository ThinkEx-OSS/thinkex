import { LiteParse } from "@llamaindex/liteparse";
import { createServer } from "node:http";

const port = 8080;
const parser = new LiteParse({
	extractLinks: true,
	imageMode: "placeholder",
	ocrEnabled: false,
	outputFormat: "markdown",
	quiet: true,
});
const parseTimeoutMs = 90_000;

createServer(async (request, response) => {
	const startedAt = Date.now();
	let inputBytes = 0;
	let pageCount = 0;
	let status = 500;
	let errorType = null;
	let errorMessage = null;

	try {
		if (request.method !== "POST" || request.url !== "/parse") {
			status = 404;
			return sendJson(response, status, { error: "Not found." });
		}

		const webRequest = new Request(`http://localhost${request.url}`, {
			body: request,
			duplex: "half",
			headers: request.headers,
			method: request.method,
		});
		const formData = await webRequest.formData();
		const file = formData.get("file");

		if (!(file instanceof File)) {
			status = 400;
			return sendJson(response, status, { error: "A PDF file is required." });
		}

		const bytes = new Uint8Array(await file.arrayBuffer());
		inputBytes = bytes.byteLength;
		const result = await withTimeout(parser.parse(bytes), parseTimeoutMs);
		pageCount = result.pages.length;
		status = 200;
		return sendJson(response, status, { markdown: result.text });
	} catch (error) {
		errorType = error instanceof Error ? error.name : "UnknownError";
		errorMessage = error instanceof Error ? error.message : String(error);
		return sendJson(response, status, { error: "PDF parsing failed." });
	} finally {
		console.info(
			JSON.stringify({
				duration_ms: Date.now() - startedAt,
				error_type: errorType,
				error_message: errorMessage,
				event: "liteparse_request",
				input_bytes: inputBytes,
				method: request.method,
				outcome: status < 400 ? "success" : "error",
				page_count: pageCount,
				path: request.url,
				status,
			}),
		);
	}
}).listen(port);

function sendJson(response, status, body) {
	response.writeHead(status, { "content-type": "application/json" });
	response.end(JSON.stringify(body));
}

function withTimeout(promise, timeoutMs) {
	let timeout;
	const timeoutPromise = new Promise((_, reject) => {
		timeout = setTimeout(() => {
			reject(new Error(`LiteParse parsing timed out after ${timeoutMs}ms.`));
		}, timeoutMs);
	});

	return Promise.race([promise, timeoutPromise]).finally(() => {
		clearTimeout(timeout);
	});
}
