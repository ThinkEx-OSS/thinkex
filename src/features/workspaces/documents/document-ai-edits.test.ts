import { describe, expect, it } from "vitest";

import { applyDocumentAiEdits } from "#/features/workspaces/documents/document-ai-edits";
import {
	ensureTiptapDocumentAiRefs,
	parseDocumentAiHtml,
	serializeTiptapDocumentToAiHtml,
} from "#/features/workspaces/documents/document-ai-html";

describe("document AI edits", () => {
	it("applies consecutive structural edits while preserving the target ref", async () => {
		const document = createDocument("<h1>Title</h1><p>Before</p>");
		const paragraphRef = await getRef(document, "p");
		const result = await applyDocumentAiEdits(document, [
			{ html: "<p>After</p>", op: "replace", ref: paragraphRef },
			{ html: "<blockquote><p>More</p></blockquote>", op: "insert_after", ref: paragraphRef },
		]);

		expect(result).toMatchObject({ applied: 2, failed: 0, status: "applied" });
		const html = await serializeTiptapDocumentToAiHtml(result.document);
		expect(html).toContain(`<p data-ref="${stableRef(paragraphRef)}.r_`);
		expect(html).toContain(">After</p><blockquote data-ref=");
	});

	it("keeps successful edits when a later target is missing", async () => {
		const document = createDocument("<p>One</p><p>Two</p>");
		const firstRef = await getRef(document, "p");
		const result = await applyDocumentAiEdits(document, [
			{ html: "<p>Updated</p>", op: "replace", ref: firstRef },
			{ op: "delete", ref: "b_missingref00.r_0000000000" },
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
			{ html: "<p>Changed</p>", op: "replace", ref: originalRef },
		]);
		const stale = await applyDocumentAiEdits(first.document, [
			{ html: "<p>Overwritten</p>", op: "replace", ref: originalRef },
		]);

		expect(stale).toMatchObject({
			applied: 0,
			failed: 1,
			failures: [{ code: "stale_target", index: 0 }],
			status: "failed",
		});
	});

	it("supports whole-document rewrites without carrying old block identities by position", async () => {
		const document = createDocument("<p>Before</p>");
		const originalRef = stableRef(await getRef(document, "p"));
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
		expect(await serializeTiptapDocumentToAiHtml(rewritten.document)).not.toContain(originalRef);
	});

	it("matches the editor's trailing paragraph after a final structural block", async () => {
		const document = createDocument("<p>Before</p>");
		const rewritten = await applyDocumentAiEdits(document, [
			{ html: "<ul><li>After</li></ul>", op: "overwrite" },
		]);

		expect(rewritten.document.content?.at(-1)).toMatchObject({ type: "paragraph" });
		expect(await serializeTiptapDocumentToAiHtml(rewritten.document)).toMatch(
			/<\/ul><p data-ref="b_[A-Za-z0-9_-]{12}\.r_[A-Za-z0-9_-]{10}"><\/p>$/,
		);
	});
});

function createDocument(html: string) {
	return ensureTiptapDocumentAiRefs(parseDocumentAiHtml(html)).document;
}

async function getRef(document: ReturnType<typeof createDocument>, tagName: string) {
	const match = (await serializeTiptapDocumentToAiHtml(document)).match(
		new RegExp(`<${tagName} data-ref="([^"]+)"`),
	);
	if (!match?.[1]) {
		throw new Error(`Expected ${tagName} ref.`);
	}
	return match[1];
}

function stableRef(ref: string) {
	return ref.split(".r_")[0];
}
