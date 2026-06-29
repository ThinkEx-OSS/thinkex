import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const port = 8080;
const maxInputBytes = 200 * 1024 * 1024;
const jpegQuality = 92;

createServer(async (request, response) => {
	if (request.method === "GET" && request.url === "/health") {
		send(response, 200, "ok");
		return;
	}

	if (request.method !== "POST" || request.url !== "/convert/jpeg") {
		send(response, 404, "Not found.");
		return;
	}

	try {
		const jpeg = await convertRequestImageToJpeg(request);
		response.writeHead(200, {
			"Content-Length": String(jpeg.byteLength),
			"Content-Type": "image/jpeg",
		});
		response.end(jpeg);
	} catch (error) {
		const status = error instanceof ConversionError ? error.status : 500;
		send(response, status, error instanceof Error ? error.message : "Image conversion failed.");
	}
}).listen(port, "0.0.0.0");

async function convertRequestImageToJpeg(incomingMessage) {
	const contentLength = Number(incomingMessage.headers["content-length"] ?? 0);

	if (!Number.isFinite(contentLength) || contentLength <= 0) {
		throw new ConversionError(400, "Missing image upload.");
	}

	if (contentLength > maxInputBytes) {
		throw new ConversionError(400, "Image upload is too large.");
	}

	const request = new Request(`http://image-file-converter${incomingMessage.url}`, {
		body: Readable.toWeb(incomingMessage),
		duplex: "half",
		headers: incomingMessage.headers,
		method: incomingMessage.method,
	});
	const formData = await request.formData();
	const file = formData.get("file");

	if (!(file instanceof File)) {
		throw new ConversionError(400, "Missing image upload.");
	}

	const inputBytes = Buffer.from(await file.arrayBuffer());

	if (inputBytes.byteLength === 0) {
		throw new ConversionError(400, "Missing image upload.");
	}

	return convertImageBytesToJpeg(inputBytes);
}

async function convertImageBytesToJpeg(inputBytes) {
	const tempDir = await mkdtemp(join(tmpdir(), "thinkex-image-"));

	try {
		const inputPath = join(tempDir, "input.heic");
		const outputPath = join(tempDir, "output.jpg");

		await writeFile(inputPath, inputBytes);
		await execFileAsync("vips", ["autorot", inputPath, `${outputPath}[Q=${jpegQuality}]`], {
			timeout: 60_000,
		});

		const outputBytes = await readFile(outputPath);

		if (outputBytes.byteLength === 0) {
			throw new ConversionError(422, "Image conversion returned an empty JPEG.");
		}

		return outputBytes;
	} catch (error) {
		if (error instanceof ConversionError) {
			throw error;
		}

		const message = getProcessErrorMessage(error);
		throw new ConversionError(422, message || "Image conversion failed.");
	} finally {
		await rm(tempDir, { force: true, recursive: true });
	}
}

function send(response, status, message) {
	response.writeHead(status, {
		"Content-Type": "text/plain; charset=utf-8",
	});
	response.end(message);
}

function getProcessErrorMessage(error) {
	if (typeof error !== "object" || error === null) {
		return "";
	}

	const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr.trim() : "";
	const message = error instanceof Error ? error.message.trim() : "";

	return stderr || message;
}

class ConversionError extends Error {
	constructor(status, message) {
		super(message);
		this.status = status;
	}
}
