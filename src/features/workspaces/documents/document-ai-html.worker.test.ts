import { describe, expect, it } from "vitest";

import {
	ensureTiptapDocumentBlockIds,
	parseDocumentAiHtml,
	serializeTiptapDocumentToAiHtml,
} from "#/features/workspaces/documents/document-ai-html";

describe("document AI HTML in Workers", () => {
	it("parses and serializes with the production runtime DOM adapter", async () => {
		const document = ensureTiptapDocumentBlockIds(
			parseDocumentAiHtml("<h2>Worker</h2><p>Schema-safe HTML</p>"),
		).document;

		expect(await serializeTiptapDocumentToAiHtml(document)).toMatch(
			/^<h2 data-edit-ref="b_[A-Za-z0-9_-]{12}\.r_[A-Za-z0-9_-]{10}">Worker<\/h2><p data-edit-ref="b_[A-Za-z0-9_-]{12}\.r_[A-Za-z0-9_-]{10}">Schema-safe HTML<\/p>$/,
		);
	});
});
