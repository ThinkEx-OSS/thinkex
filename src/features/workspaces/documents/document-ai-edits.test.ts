import { describe, expect, it } from "vitest";

import { applyDocumentAiEdits } from "#/features/workspaces/documents/document-ai-edits";
import {
	ensureTiptapDocumentBlockIds,
	parseDocumentAiHtml,
	parseDocumentAiRef,
	serializeTiptapNodeToEditableAiHtml,
	serializeTiptapDocumentToAiHtml,
} from "#/features/workspaces/documents/document-ai-html";
import { getTiptapDocumentSchema } from "#/features/workspaces/documents/tiptap-schema";

describe("document AI edits", () => {
	it("applies consecutive structural edits while preserving the block ID", async () => {
		const document = createDocument("<h1>Title</h1><p>Before</p>");
		const paragraphRef = await getRef(document, "p");
		const result = await applyDocumentAiEdits(document, [
			{ ref: paragraphRef, html: "<p>After</p>", op: "replace" },
			{
				ref: paragraphRef,
				html: "<blockquote><p>More</p></blockquote>",
				op: "insert_after",
			},
		]);

		expect(result).toMatchObject({ applied: 2, failed: 0, status: "applied" });
		const html = await serializeTiptapDocumentToAiHtml(result.document);
		expect(html).toContain(`<p data-ref="${parseDocumentAiRef(paragraphRef)}.r_`);
		expect(html).toContain(">After</p><blockquote data-ref=");
	});

	it("keeps successful edits when a later target is missing", async () => {
		const document = createDocument("<p>One</p><p>Two</p>");
		const firstRef = await getRef(document, "p");
		const result = await applyDocumentAiEdits(document, [
			{ ref: firstRef, html: "<p>Updated</p>", op: "replace" },
			{ ref: "b_missingref00.r_0000000000", op: "delete" },
		]);

		expect(result).toMatchObject({
			applied: 1,
			failed: 1,
			failures: [{ code: "ref_not_found", index: 1 }],
			status: "partial",
		});
		expect(await serializeTiptapDocumentToAiHtml(result.document)).toContain(">Updated</p>");
	});

	it("rejects a ref after that block changed in another edit call", async () => {
		const document = createDocument("<p>Before</p>");
		const originalRef = await getRef(document, "p");
		const first = await applyDocumentAiEdits(document, [
			{ ref: originalRef, html: "<p>Changed</p>", op: "replace" },
		]);
		const stale = await applyDocumentAiEdits(first.document, [
			{ ref: originalRef, html: "<p>Overwritten</p>", op: "replace" },
		]);

		expect(stale).toMatchObject({
			applied: 0,
			failed: 1,
			failures: [{ code: "ref_stale", index: 0 }],
			status: "failed",
		});
	});

	it("moves a block relative to another ref without changing its identity", async () => {
		const document = createDocument("<p>One</p><p>Two</p><p>Three</p>");
		const [firstRef, , thirdRef] = await getRefs(document, "p");
		const result = await applyDocumentAiEdits(document, [
			{ ref: thirdRef!, beforeRef: firstRef!, op: "move" },
		]);
		const html = await serializeTiptapDocumentToAiHtml(result.document);

		expect(result).toMatchObject({ applied: 1, failed: 0, status: "applied" });
		expect(html.indexOf(">Three</p>")).toBeLessThan(html.indexOf(">One</p>"));
		expect(html).toContain(thirdRef);
	});

	it("keeps update to one block while replace may expand it", async () => {
		const document = createDocument("<p>Before</p>");
		const ref = await getRef(document, "p");
		const invalidUpdate = await applyDocumentAiEdits(document, [
			{ ref, html: "<p>One</p><p>Two</p>", op: "update" },
		]);
		const replacement = await applyDocumentAiEdits(document, [
			{ ref, html: "<p>One</p><p>Two</p>", op: "replace" },
		]);

		expect(invalidUpdate.failures).toMatchObject([{ code: "invalid_html", index: 0 }]);
		expect(replacement).toMatchObject({ applied: 1, failed: 0, status: "applied" });
		expect(await serializeTiptapDocumentToAiHtml(replacement.document)).toContain(
			">One</p><p data-ref=",
		);
	});

	it("matches the editor's trailing paragraph after a final structural block", async () => {
		const document = createDocument("<p>Before</p>");
		const ref = await getRef(document, "p");
		const rewritten = await applyDocumentAiEdits(document, [
			{ ref, html: "<ul><li>After</li></ul>", op: "replace" },
		]);

		expect(rewritten.document.content?.at(-1)).toMatchObject({ type: "paragraph" });
		expect(await serializeTiptapDocumentToAiHtml(rewritten.document)).toMatch(
			/<\/ul><p data-ref="b_[A-Za-z0-9_-]{12}\.r_[A-Za-z0-9_-]{10}"><\/p>$/,
		);
	});

	it("rejects an ambiguous text replacement", async () => {
		const document = createDocument("<p>Repeat. Repeat.</p>");
		const ref = await getRef(document, "p");
		const result = await applyDocumentAiEdits(document, [
			{ ref, find: "Repeat", op: "replace_text", replace: "Stop" },
		]);

		expect(result.failures).toMatchObject([{ code: "edit_not_unique", index: 0 }]);
	});

	it("replaces the exact widget HTML returned by a block read", async () => {
		const document = createDocument(
			'<div data-type="widget" title="Timer">&lt;button&gt;Start&lt;/button&gt;</div>',
		);
		const ref = await getRef(document, "div");
		const content = serializeTiptapNodeToEditableAiHtml(
			getTiptapDocumentSchema().nodeFromJSON(document).child(0),
		);
		const result = await applyDocumentAiEdits(document, [
			{
				ref,
				find: content,
				op: "replace_text",
				replace: '<div data-type="widget" title="Clock">&lt;button&gt;Go&lt;/button&gt;</div>',
			},
		]);

		expect(result).toMatchObject({ applied: 1, failed: 0, status: "applied" });
		expect(getTiptapDocumentSchema().nodeFromJSON(result.document).child(0).attrs.title).toBe(
			"Clock",
		);
		expect(getWidgetSource(result.document)).toBe("<button>Go</button>");
	});

	it("rejects a widget edit with invalid JavaScript and preserves the existing widget", async () => {
		const source = '<button id="run">Run</button><script>const ready = true;</script>';
		const document = createDocument(
			`<div data-type="widget" title="Runner">${source.replaceAll("<", "&lt;")}</div>`,
		);
		const ref = await getRef(document, "div");
		const brokenSource = '<button id="run">Run</button><script>const ready = ;</script>';
		const result = await applyDocumentAiEdits(document, [
			{
				ref,
				html: `<div data-type="widget" title="Runner">${brokenSource.replaceAll("<", "&lt;")}</div>`,
				op: "replace",
			},
		]);

		expect(result).toMatchObject({
			applied: 0,
			failed: 1,
			failures: [
				{
					code: "widget_script_syntax_error",
					detail: expect.stringContaining("Unexpected token"),
					index: 0,
				},
			],
			status: "failed",
		});
		expect(getWidgetSource(result.document)).toBe(source);
	});
});

function createDocument(html: string) {
	return ensureTiptapDocumentBlockIds(parseDocumentAiHtml(html)).document;
}

async function getRef(document: ReturnType<typeof createDocument>, tagName: string) {
	const [ref] = await getRefs(document, tagName);
	if (!ref) {
		throw new Error(`Expected ${tagName} ref.`);
	}
	return ref;
}

async function getRefs(document: ReturnType<typeof createDocument>, tagName: string) {
	return Array.from(
		(await serializeTiptapDocumentToAiHtml(document)).matchAll(
			new RegExp(`<${tagName}\\b[^>]*\\sdata-ref="([^"]+)"`, "g"),
		),
		(match) => match[1],
	);
}

function getWidgetSource(document: ReturnType<typeof createDocument>) {
	let source = "";
	getTiptapDocumentSchema()
		.nodeFromJSON(document)
		.forEach((node) => {
			if (node.type.name === "widget") {
				source = node.textContent;
			}
		});
	return source;
}
