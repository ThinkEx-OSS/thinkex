import { Container, getRandom } from "@cloudflare/containers";

import type { MarkdownProjectionPage } from "#/features/workspaces/extraction/page-markdown-projection";
import { parseLiteParsePages } from "#/features/workspaces/extraction/providers/liteparse-response";

const liteParsePort = 8080;
const liteParsePoolSize = 2;

export class LiteParsePdfExtractor extends Container {
	defaultPort = liteParsePort;
	requiredPorts = [liteParsePort];
	sleepAfter = "5m";
	enableInternet = false;
}

export async function extractPdfWithLiteParse(
	env: Cloudflare.Env,
	input: { bytes: Uint8Array; fileName: string },
): Promise<MarkdownProjectionPage[]> {
	const extractor = await getRandom(env.LITEPARSE_PDF_EXTRACTOR, liteParsePoolSize);
	await extractor.startAndWaitForPorts({
		cancellationOptions: { portReadyTimeoutMS: 60_000 },
	});

	const formData = new FormData();
	formData.set(
		"file",
		new File([input.bytes.slice().buffer], input.fileName, { type: "application/pdf" }),
		input.fileName,
	);
	const response = await extractor.fetch(
		new Request("http://liteparse-pdf-extractor/parse", {
			body: formData,
			method: "POST",
		}),
	);

	if (!response.ok) {
		throw new Error(`LiteParse failed with status ${response.status}.`);
	}

	const payload: unknown = await response.json();
	const pages = parseLiteParsePages(payload);

	if (!pages.some((page) => page.markdown.trim().length > 0)) {
		throw new Error("LiteParse did not extract usable page Markdown.");
	}

	return pages;
}
