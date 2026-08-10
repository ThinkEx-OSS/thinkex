import { describe, expect, it } from "vitest";

import {
	DocumentAiHtmlError,
	ensureTiptapDocumentBlockIds,
	parseDocumentAiHtml,
	serializeTiptapDocumentToAiHtml,
	WidgetScriptSyntaxError,
} from "#/features/workspaces/documents/document-ai-html";

describe("document AI HTML", () => {
	it("round-trips supported rich content through the Tiptap schema", async () => {
		const document = ensureTiptapDocumentBlockIds(
			parseDocumentAiHtml(
				'<h1>Notes</h1><p>Use <strong>bold</strong>, <a href="https://thinkex.app">links</a>, and <span data-type="inline-math" data-latex="x^2"></span>.</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input checked type="checkbox"><span></span></label><div><p>Done</p></div></li></ul>',
			),
		).document;
		const html = await serializeTiptapDocumentToAiHtml(document);

		expect(html).toMatch(
			/^<h1 data-edit-ref="b_[A-Za-z0-9_-]{12}\.r_[A-Za-z0-9_-]{10}">Notes<\/h1>/,
		);
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain('data-type="inline-math"');
		expect(html).toContain('data-type="taskItem"');
		expect(parseDocumentAiHtml(html)).toMatchObject({ type: "doc" });
	});

	it("converts sub/sup into inline math instead of failing the write", async () => {
		// Models write `CH<sub>4</sub>` in prose by habit — evals showed it even
		// with an explicit instruction not to. This used to throw and lose the
		// entire document rather than the two characters it could not represent.
		const html = await serializeTiptapDocumentToAiHtml(
			ensureTiptapDocumentBlockIds(parseDocumentAiHtml("<p>CH<sub>4</sub> and x<sup>2</sup></p>"))
				.document,
		);

		expect(html).toContain('data-latex="{}_{4}"');
		expect(html).toContain('data-latex="{}^{2}"');
		expect(html).not.toContain("<sub>");
	});

	it("ignores editRefs supplied in model-authored HTML", async () => {
		const html = await serializeTiptapDocumentToAiHtml(
			ensureTiptapDocumentBlockIds(
				parseDocumentAiHtml('<p data-edit-ref="b_modelchosen1">Hello</p>'),
			).document,
		);

		expect(html).not.toContain("b_modelchosen1");
		expect(html).toMatch(/data-edit-ref="b_[A-Za-z0-9_-]{12}\.r_[A-Za-z0-9_-]{10}"/);
	});

	it("normalizes malformed but recoverable HTML", () => {
		const document = parseDocumentAiHtml("<p>Hello <strong>world</p><ul><li>One<li>Two</ul>");

		expect(document).toMatchObject({
			content: [
				{ type: "paragraph" },
				{ content: [{ type: "listItem" }, { type: "listItem" }], type: "bulletList" },
			],
			type: "doc",
		});
	});

	it("keeps only schema-supported attributes and safe links", async () => {
		const document = ensureTiptapDocumentBlockIds(
			parseDocumentAiHtml(
				'<p class="ignored" data-extra="ignored" onclick="alert(1)"><a href="javascript:alert(1)" title="ignored">Unsafe</a></p>',
			),
		).document;

		const html = await serializeTiptapDocumentToAiHtml(document);
		expect(html).not.toContain("class=");
		expect(html).not.toContain("data-extra");
		expect(html).not.toContain("onclick");
		expect(html).not.toContain("javascript:");
		expect(html).toContain(">Unsafe</p>");
	});

	it("degrades unsupported markup instead of losing the whole write", async () => {
		// Rejecting cost the entire document to save formatting we can flatten:
		// a probe of realistic model markup found 12 of 20 snippets refused.
		const html = await serializeTiptapDocumentToAiHtml(
			ensureTiptapDocumentBlockIds(
				parseDocumentAiHtml(
					'<figure><p>Kept</p></figure><div class="callout"><h5>Heading</h5></div><dl><dt>Force</dt><dd>Mass times acceleration</dd></dl><p>An <span class="hl">inline</span> span</p>',
				),
			).document,
		);

		expect(html).toContain(">Kept</p>");
		// h5 has no schema level, so it lands on the nearest real heading.
		expect(html).toContain("<h4");
		expect(html).toContain(">Heading</h4>");
		expect(html).toContain(">Force</p>");
		expect(html).toContain(">Mass times acceleration</p>");
		expect(html).toContain(">An inline span</p>");
		expect(html).not.toContain("<figure");
		expect(html).not.toContain("<dl");
	});

	it("still rejects Markdown sent as document content", () => {
		// The one thing degradation must not paper over: plain text at the top
		// level means the model sent Markdown, which would flatten into a single
		// paragraph of literal source.
		expect(() => parseDocumentAiHtml("# Heading\n\nSome **bold** text")).toThrow(
			DocumentAiHtmlError,
		);
	});

	it("rejects invalid inline JavaScript in a widget before persistence", () => {
		const source = '<button id="run">Run</button><script>const broken = ;</script>';
		const html = `<div data-type="widget" title="Broken">${source.replaceAll("<", "&lt;")}</div>`;

		expect(() => parseDocumentAiHtml(html)).toThrow(
			"Widget 1 script 1 has invalid JavaScript: Unexpected token",
		);
	});

	it("accepts valid classic and module scripts while ignoring data blocks", () => {
		const source = `<script>document.body.dataset.ready = "true";</script>
<script type="module">const value = await Promise.resolve(1);</script>
<script type="application/json">{"not": javascript}</script>`;
		const html = `<div data-type="widget">${source.replaceAll("<", "&lt;")}</div>`;

		expect(parseDocumentAiHtml(html)).toMatchObject({ type: "doc" });
	});

	it("rejects invalid JavaScript when its MIME type has spaced parameters", () => {
		const source = '<script type="text/javascript ; charset=utf-8">const broken = ;</script>';
		const html = `<div data-type="widget">${source.replaceAll("<", "&lt;")}</div>`;

		expect(() => parseDocumentAiHtml(html)).toThrow(WidgetScriptSyntaxError);
	});
});
