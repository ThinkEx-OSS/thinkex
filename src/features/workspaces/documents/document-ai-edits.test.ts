import { describe, expect, it } from "vitest";

import { applyDocumentAiEdits } from "#/features/workspaces/documents/document-ai-edits";
import {
	ensureTiptapDocumentBlockIds,
	parseDocumentAiHtml,
	parseDocumentAiEditRef,
	serializeTiptapNodeToEditableAiHtml,
	serializeTiptapDocumentToAiHtml,
} from "#/features/workspaces/documents/document-ai-html";
import { getTiptapDocumentSchema } from "#/features/workspaces/documents/tiptap-schema";

describe("document AI edits", () => {
	it("applies consecutive structural edits while preserving the block ID", async () => {
		const document = createDocument("<h1>Title</h1><p>Before</p>");
		const paragraphEditRef = await getEditRef(document, "p");
		const result = await applyDocumentAiEdits(document, [
			{ editRef: paragraphEditRef, html: "<p>After</p>", op: "replace" },
			{
				editRef: paragraphEditRef,
				html: "<blockquote><p>More</p></blockquote>",
				op: "insert_after",
			},
		]);

		expect(result).toMatchObject({ applied: 2, failed: 0, status: "applied" });
		const html = await serializeTiptapDocumentToAiHtml(result.document);
		expect(html).toContain(`<p data-edit-ref="${parseDocumentAiEditRef(paragraphEditRef)}.r_`);
		expect(html).toContain(">After</p><blockquote data-edit-ref=");
	});

	it("keeps successful edits when a later target is missing", async () => {
		const document = createDocument("<p>One</p><p>Two</p>");
		const firstEditRef = await getEditRef(document, "p");
		const result = await applyDocumentAiEdits(document, [
			{ editRef: firstEditRef, html: "<p>Updated</p>", op: "replace" },
			{ editRef: "b_missingref00.r_0000000000", op: "delete" },
		]);

		expect(result).toMatchObject({
			applied: 1,
			failed: 1,
			failures: [{ code: "edit_ref_not_found", index: 1 }],
			status: "partial",
		});
		expect(await serializeTiptapDocumentToAiHtml(result.document)).toContain(">Updated</p>");
	});

	it("rejects an editRef after that block changed in another edit call", async () => {
		const document = createDocument("<p>Before</p>");
		const originalEditRef = await getEditRef(document, "p");
		const first = await applyDocumentAiEdits(document, [
			{ editRef: originalEditRef, html: "<p>Changed</p>", op: "replace" },
		]);
		const stale = await applyDocumentAiEdits(first.document, [
			{ editRef: originalEditRef, html: "<p>Overwritten</p>", op: "replace" },
		]);

		expect(stale).toMatchObject({
			applied: 0,
			failed: 1,
			failures: [{ code: "edit_ref_stale", index: 0 }],
			status: "failed",
		});
	});

	it("supports whole-document rewrites without carrying old block identities by position", async () => {
		const document = createDocument("<p>Before</p>");
		const originalBlockId = parseDocumentAiEditRef(await getEditRef(document, "p"));
		const rewritten = await applyDocumentAiEdits(document, [
			{ html: "<h1>New</h1><p>Document</p>", op: "overwrite" },
		]);
		const noOp = await applyDocumentAiEdits(rewritten.document, [
			{ html: "<h1>New</h1><p>Document</p>", op: "overwrite" },
		]);

		expect(rewritten).toMatchObject({ applied: 1, failed: 0, status: "applied" });
		expect(noOp).toMatchObject({
			applied: 0,
			failed: 1,
			failures: [{ code: "no_change", index: 0 }],
			status: "failed",
		});
		expect(await serializeTiptapDocumentToAiHtml(rewritten.document)).not.toContain(
			originalBlockId,
		);
	});

	it("matches the editor's trailing paragraph after a final structural block", async () => {
		const document = createDocument("<p>Before</p>");
		const rewritten = await applyDocumentAiEdits(document, [
			{ html: "<ul><li>After</li></ul>", op: "overwrite" },
		]);

		expect(rewritten.document.content?.at(-1)).toMatchObject({ type: "paragraph" });
		expect(await serializeTiptapDocumentToAiHtml(rewritten.document)).toMatch(
			/<\/ul><p data-edit-ref="b_[A-Za-z0-9_-]{12}\.r_[A-Za-z0-9_-]{10}"><\/p>$/,
		);
	});

	it("rejects an ambiguous text replacement", async () => {
		const document = createDocument("<p>Repeat. Repeat.</p>");
		const editRef = await getEditRef(document, "p");
		const result = await applyDocumentAiEdits(document, [
			{ editRef, find: "Repeat", op: "replace_text", replace: "Stop" },
		]);

		expect(result.failures).toMatchObject([{ code: "edit_not_unique", index: 0 }]);
	});

	it("replaces the exact widget HTML returned by a block read", async () => {
		const document = createDocument(
			'<div data-type="widget" title="Timer">&lt;button&gt;Start&lt;/button&gt;</div>',
		);
		const editRef = await getEditRef(document, "div");
		const content = serializeTiptapNodeToEditableAiHtml(
			getTiptapDocumentSchema().nodeFromJSON(document).child(0),
		);
		const result = await applyDocumentAiEdits(document, [
			{
				editRef,
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
		const editRef = await getEditRef(document, "div");
		const brokenSource = '<button id="run">Run</button><script>const ready = ;</script>';
		const result = await applyDocumentAiEdits(document, [
			{
				editRef,
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

async function getEditRef(document: ReturnType<typeof createDocument>, tagName: string) {
	const match = (await serializeTiptapDocumentToAiHtml(document)).match(
		new RegExp(`<${tagName}\\b[^>]*\\sdata-edit-ref="([^"]+)"`),
	);
	if (!match?.[1]) {
		throw new Error(`Expected ${tagName} editRef.`);
	}
	return match[1];
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
