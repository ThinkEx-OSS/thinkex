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
		const result = await parser.parse(bytes);
		const pages = result.pages.map((page) => ({
			markdown: page.markdown ?? page.text ?? "",
			pageNumber: page.pageNum,
		}));
		pageCount = pages.length;
		status = 200;
		return sendJson(response, status, { pages });
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
