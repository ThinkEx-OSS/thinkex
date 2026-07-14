import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";
import { parseLiteParsePage } from "#/features/workspaces/extraction/providers/liteparse-response";
import { requestWorkspaceFileProcessor } from "#/features/workspaces/files/workspace-file-processor";

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
		throw new Error(`LiteParse failed with status ${response.status}.`);
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

async function* readNdjsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
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
		reader.releaseLock();
	}
}
