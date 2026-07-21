import { LiteParse } from "@llamaindex/liteparse";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { promisify } from "node:util";

const port = 8080;
const parser = new LiteParse({
	extractLinks: true,
	imageMode: "placeholder",
	ocrEnabled: false,
	outputFormat: "markdown",
	quiet: true,
});
const parseTimeoutMs = 90_000;
const maxInputBytes = 100 * 1024 * 1024;
const execFileAsync = promisify(execFile);

createServer(async (request, response) => {
	const startedAt = Date.now();
	let inputBytes = 0;
	let pageCount = 0;
	let status = 500;
	let errorType = null;
	let errorMessage = null;

	try {
		if (
			request.method === "POST" &&
			(request.url === "/prepare/pdf" || request.url === "/preview/image")
		) {
			const preview = await generatePreviewRequest(
				request,
				request.url === "/prepare/pdf" ? "pdf" : "image",
			);
			inputBytes = preview.inputBytes;
			status = 200;
			response.writeHead(status, {
				"content-length": String(preview.bytes.byteLength),
				"content-type": "image/webp",
			});
			return response.end(preview.bytes);
		}

		if (request.method !== "POST" || request.url !== "/parse/pdf") {
			status = 404;
			return sendJson(response, status, { error: "Not found." });
		}

		const bytes = await readPdfRequestBytes(request);
		inputBytes = bytes.byteLength;
		const result = await withTimeout(parser.parse(bytes), parseTimeoutMs);
		pageCount = result.pages.length;
		status = 200;
		response.writeHead(status, { "content-type": "application/x-ndjson; charset=utf-8" });
		for (const page of result.pages) {
			if (
				!response.write(
					`${JSON.stringify({ markdown: page.markdown, pageNumber: page.pageNum })}\n`,
				)
			) {
				await once(response, "drain");
			}
		}
		return response.end();
	} catch (error) {
		errorType = error instanceof Error ? error.name : "UnknownError";
		errorMessage = error instanceof Error ? error.message : String(error);
		if (error instanceof PdfValidationError) {
			status = error.status;
			return sendJson(response, status, { code: error.code, error: error.message });
		}
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

async function validatePdfFile(filePath) {
	try {
		await execFileAsync("pdfinfo", [filePath], { timeout: 30_000 });
	} catch (error) {
		const message = getProcessErrorMessage(error);

		if (/password|encrypted/i.test(message)) {
			throw new PdfValidationError(
				422,
				"PASSWORD_PROTECTED_PDF",
				"Password-protected PDFs are not supported.",
			);
		}

		throw new PdfValidationError(422, "INVALID_PDF", "PDF is damaged or invalid.");
	}
}

async function readPdfRequestBytes(request) {
	return withRequestFile(
		request,
		"thinkex-parse-",
		async ({ filePath }) => new Uint8Array(await readFile(filePath)),
	);
}

async function generatePreviewRequest(request, kind) {
	return withRequestFile(request, "thinkex-preview-", async ({ filePath, sizeBytes, tempDir }) => {
		if (kind === "pdf") {
			await validatePdfFile(filePath);
		}
		const previewInputPath = kind === "pdf" ? `${filePath}[page=0,n=1]` : filePath;
		const outputPath = join(tempDir, "preview.webp");

		await execFileAsync(
			"vips",
			[
				"thumbnail",
				previewInputPath,
				`${outputPath}[Q=80,strip]`,
				"480",
				"--height",
				"1200",
				"--size",
				"down",
				"--auto-rotate",
			],
			{ timeout: 60_000 },
		);

		return { bytes: await readFile(outputPath), inputBytes: sizeBytes };
	});
}

async function withRequestFile(request, prefix, run) {
	const tempDir = await mkdtemp(join(tmpdir(), prefix));
	const filePath = join(tempDir, "upload.bin");
	let sizeBytes = 0;
	const limiter = new Transform({
		transform(chunk, _encoding, callback) {
			sizeBytes += chunk.byteLength;

			if (sizeBytes > maxInputBytes) {
				callback(new PdfValidationError(413, "UPLOAD_TOO_LARGE", "File is too large."));
				return;
			}

			callback(null, chunk);
		},
	});

	try {
		await pipeline(request, limiter, createWriteStream(filePath));

		if (sizeBytes === 0) {
			throw new PdfValidationError(422, "INVALID_FILE", "File is empty.");
		}

		return await run({ filePath, sizeBytes, tempDir });
	} finally {
		await rm(tempDir, { force: true, recursive: true });
	}
}

function getProcessErrorMessage(error) {
	if (typeof error !== "object" || error === null) {
		return "";
	}

	const stderr = "stderr" in error ? String(error.stderr).trim() : "";
	const stdout = "stdout" in error ? String(error.stdout).trim() : "";
	const message = error instanceof Error ? error.message.trim() : "";
	return stderr || stdout || message;
}

class PdfValidationError extends Error {
	constructor(status, code, message) {
		super(message);
		this.status = status;
		this.code = code;
	}
}

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
