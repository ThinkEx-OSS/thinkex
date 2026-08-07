import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";
import { parseLiteParsePage } from "#/features/workspaces/extraction/providers/liteparse-response";
import { WorkspaceDocumentUnsupportedError } from "#/features/workspaces/extraction/types";
import { requestWorkspaceFileProcessor } from "#/features/workspaces/files/workspace-file-processor";

const maxNdjsonLineBytes = 8 * 1024 * 1024;

export async function* extractPdfWithLiteParse(
	env: Cloudflare.Env,
	input: {
		body: ReadableStream<Uint8Array>;
		fileName: string;
		sizeBytes: number;
	},
): AsyncGenerator<MarkdownProjectionPage> {
	const response = await requestWorkspaceFileProcessor(env, {
		body: input.body,
		contentType: "application/pdf",
		fileName: input.fileName,
		path: "/parse/pdf",
		sizeBytes: input.sizeBytes,
	});

	if (!response.ok) {
		// The processor answers 422 only when it has read the file and found it
		// unusable — too long, encrypted, or damaged. Every other status is an
		// extraction that went wrong and may work next time.
		throw response.status === 422
			? new WorkspaceDocumentUnsupportedError(await getLiteParseErrorMessage(response))
			: new Error(`LiteParse failed with status ${response.status}.`);
	}

	if (!response.body) {
		throw new Error("LiteParse completed without a response body.");
	}

	for await (const line of readNdjsonLines(response.body)) {
		let payload: unknown;
		try {
			payload = JSON.parse(line);
		} catch {
			throw new Error("LiteParse returned invalid NDJSON.");
		}
		yield parseLiteParsePage(payload);
	}
}

async function getLiteParseErrorMessage(response: Response) {
	const body: unknown = await response.json().catch(() => null);

	return typeof body === "object" &&
		body !== null &&
		"error" in body &&
		typeof body.error === "string"
		? body.error
		: "This document cannot be read.";
}

async function* readNdjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let pendingLineBytes = 0;

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (value) {
				let offset = 0;
				while (offset < value.byteLength) {
					const newlineOffset = value.indexOf(0x0a, offset);
					const segmentEnd = newlineOffset === -1 ? value.byteLength : newlineOffset;
					pendingLineBytes += segmentEnd - offset;
					if (pendingLineBytes > maxNdjsonLineBytes) {
						throw new Error("LiteParse returned an oversized NDJSON page.");
					}
					if (newlineOffset === -1) {
						break;
					}
					pendingLineBytes = 0;
					offset = newlineOffset + 1;
				}
			}

			buffer += decoder.decode(value, { stream: !done });
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				if (line.trim()) {
					yield line;
				}
			}

			if (done) {
				break;
			}
		}

		if (buffer.trim()) {
			yield buffer;
		}
	} finally {
		await reader.cancel().catch(() => undefined);
		reader.releaseLock();
	}
}
