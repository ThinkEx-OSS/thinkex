import { describe, expect, it } from "vitest";

import { parseDocumentAiHtml } from "#/features/workspaces/documents/document-ai-html";
import { serializeTiptapDocumentToMarkdown } from "#/features/workspaces/documents/document-markdown";
import { extractDocumentPreviewText } from "#/features/workspaces/documents/document-preview-text";
import { stringifyTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";

const widgetSource = "<script>alert(1)</script><div>SOURCE</div>";

function createDocumentWithWidget(title: string) {
	return stringifyTiptapDocumentJson(
		parseDocumentAiHtml(
			`<p>Waves intro</p><div data-type="widget" title="${title}">${widgetSource.replaceAll("<", "&lt;")}</div><p>After</p>`,
		),
	);
}

describe("document preview text", () => {
	it("previews a widget by title rather than by its source", () => {
		expect(extractDocumentPreviewText(createDocumentWithWidget("Sine explorer"))).toBe(
			"Waves intro\nSine explorer\nAfter",
		);
	});

	// Search indexes the markdown projection, so keeping widgets out of it is
	// what keeps their source out of the full-text index.
	it("keeps widget source out of the markdown search projection", () => {
		const markdown = serializeTiptapDocumentToMarkdown(
			parseDocumentAiHtml(
				`<p>Waves intro</p><div data-type="widget" title="Sine explorer">${widgetSource.replaceAll("<", "&lt;")}</div>`,
			),
		);

		expect(markdown).toContain("Waves intro");
		expect(markdown).not.toContain("SOURCE");
		expect(markdown).not.toContain("Sine explorer");
	});
});
