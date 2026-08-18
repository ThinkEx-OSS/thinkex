import { DOMSerializer } from "@tiptap/pm/model";
import katex from "katex";
import { parseHTML } from "linkedom";

import {
	getCodeLanguageLabel,
	highlightCodeTokens,
	isMermaidCodeLanguage,
} from "#/features/workspaces/documents/code-block-shiki/highlighter";
import type { TiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { getTiptapDocumentSchema } from "#/features/workspaces/documents/tiptap-schema";

const pdfDocumentStyles = `
	:root {
		color: #202124;
		background: #ffffff;
		font-family: Arial, Helvetica, sans-serif;
		font-size: 11pt;
		-webkit-print-color-adjust: exact;
		print-color-adjust: exact;
	}
	* { box-sizing: border-box; }
	body { margin: 0; }
	article { width: 100%; overflow-wrap: anywhere; }
	h1, h2, h3, h4 { break-after: avoid; color: #171717; line-height: 1.2; }
	h1 { margin: 0 0 0.55em; font-size: 24pt; }
	h2 { margin: 1.25em 0 0.45em; font-size: 18pt; }
	h3 { margin: 1.15em 0 0.4em; font-size: 14pt; }
	h4 { margin: 1em 0 0.35em; font-size: 11.5pt; }
	p { margin: 0 0 0.75em; line-height: 1.55; }
	ul, ol { margin: 0 0 0.8em; padding-left: 1.5em; }
	li { margin: 0.18em 0; line-height: 1.45; }
	li > p { margin-bottom: 0.2em; }
	blockquote {
		margin: 0.9em 0;
		padding: 0.15em 0 0.15em 0.9em;
		border-left: 3px solid #c8c8c8;
		color: #525252;
	}
	a { color: #1558b0; text-decoration: underline; }
	mark { background: #fff1a8; }
	hr { margin: 1.25em 0; border: 0; border-top: 1px solid #d8d8d8; }
	img { max-width: 100%; max-height: 7.5in; height: auto; margin: 0.6em 0; border-radius: 6px; break-inside: avoid; }
	table { width: 100%; margin: 1em 0; border-collapse: collapse; table-layout: fixed; }
	tr { break-inside: avoid; }
	th, td { padding: 0.45em 0.55em; border: 1px solid #cfcfcf; text-align: left; vertical-align: top; }
	th { background: #f3f4f6; font-weight: 600; }
	code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
	:not(pre) > code { padding: 0.08em 0.28em; border-radius: 3px; background: #f1f3f5; font-size: 0.9em; }
	.pdf-code-block {
		margin: 1em 0;
		border: 1px solid #d9dde3;
		border-radius: 6px;
		background: #f6f8fa;
		break-inside: avoid;
		overflow: hidden;
	}
	.pdf-code-label {
		padding: 0.34em 0.7em;
		border-bottom: 1px solid #d9dde3;
		background: #edf0f3;
		color: #5b616a;
		font: 600 8.5pt Arial, Helvetica, sans-serif;
	}
	.pdf-code-block pre {
		margin: 0;
		padding: 0.75em 0.85em;
		background: #f6f8fa;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		word-break: break-word;
	}
	.pdf-code-block pre code { font-size: 8.6pt; line-height: 1.45; }
	[data-type="block-math"] { margin: 1em 0; overflow-wrap: anywhere; text-align: center; break-inside: avoid; }
	[data-type="inline-math"] { display: inline; }
	.math-fallback { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; white-space: pre-wrap; }
	details { margin: 0.8em 0; padding: 0.55em 0.7em; border: 1px solid #d9dde3; border-radius: 5px; }
	summary { margin-bottom: 0.45em; font-weight: 600; }
	[data-type="taskList"] { list-style: none; padding-left: 0; }
	[data-type="taskItem"] { display: flex; gap: 0.5em; align-items: flex-start; }
	[data-type="taskItem"] > label { flex: 0 0 auto; }
`;

export async function renderWorkspaceDocumentPdfHtml(document: TiptapDocumentJson) {
	const schema = getTiptapDocumentSchema();
	const proseMirrorDocument = schema.nodeFromJSON(document);
	const { document: htmlDocument } = parseHTML("<html><head></head><body></body></html>");
	const article = htmlDocument.createElement("article");
	article.className = "document";
	article.appendChild(
		DOMSerializer.fromSchema(schema).serializeFragment(proseMirrorDocument.content, {
			document: htmlDocument as unknown as Document,
		}) as unknown as globalThis.Node,
	);

	removeUnexportedNodes(article);
	renderMath(article);
	await renderCodeBlocks(htmlDocument, article);

	for (const details of article.querySelectorAll("details")) {
		details.setAttribute("open", "");
	}

	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${pdfDocumentStyles}</style></head><body>${article.outerHTML}</body></html>`;
}

/**
 * What a printed page cannot carry. A citation has nothing to link to; a
 * widget is markup that has to run; a mermaid block is an instruction for
 * drawing rather than the drawing. Falling back to source for the last two
 * would put authoring material in front of a reader who asked for a document,
 * so all three leave nothing behind.
 */
function removeUnexportedNodes(article: Element) {
	for (const node of article.querySelectorAll('citation, [data-type="widget"]')) {
		node.remove();
	}
	for (const code of article.querySelectorAll("pre > code")) {
		if (isMermaidCodeLanguage(readCodeBlockLanguage(code))) {
			code.parentElement?.remove();
		}
	}
}

/** The language a code block declares, exactly as it was written. */
function readCodeBlockLanguage(element: Element) {
	const languageClass = Array.from(element.classList).find((name) => name.startsWith("language-"));
	return languageClass?.slice("language-".length) || null;
}

function renderMath(article: Element) {
	for (const element of article.querySelectorAll(
		'[data-type="inline-math"], [data-type="block-math"]',
	)) {
		const latex = element.getAttribute("data-latex") ?? "";
		const displayMode = element.getAttribute("data-type") === "block-math";

		try {
			element.innerHTML = katex.renderToString(latex, {
				displayMode,
				output: "mathml",
				strict: "ignore",
				throwOnError: true,
			});
		} catch {
			element.classList.add("math-fallback");
			element.textContent = displayMode ? `$$${latex}$$` : `$${latex}$`;
		}
	}
}

async function renderCodeBlocks(htmlDocument: Document, article: Element) {
	const codeBlocks = Array.from(article.querySelectorAll("pre > code"));
	const rendered = await Promise.all(
		codeBlocks.map(async (element) => {
			const code = element.textContent ?? "";
			const language = readCodeBlockLanguage(element);
			return {
				code,
				element,
				highlighted: await highlightCodeTokens({ code, language }),
				language,
			};
		}),
	);

	for (const block of rendered) {
		const pre = block.element.parentElement;
		if (!pre) {
			continue;
		}

		const wrapper = htmlDocument.createElement("div");
		wrapper.className = "pdf-code-block";
		const label = htmlDocument.createElement("div");
		label.className = "pdf-code-label";
		label.textContent = getCodeLanguageLabel(block.language);
		pre.replaceWith(wrapper as unknown as globalThis.Node);
		wrapper.appendChild(label as unknown as globalThis.Node);
		wrapper.appendChild(pre as unknown as globalThis.Node);

		block.element.textContent = "";
		if (!block.highlighted) {
			block.element.textContent = block.code;
			continue;
		}

		for (const [lineIndex, line] of block.highlighted.tokens.entries()) {
			if (lineIndex > 0) {
				block.element.appendChild(htmlDocument.createTextNode("\n") as unknown as globalThis.Node);
			}
			for (const token of line) {
				const span = htmlDocument.createElement("span");
				const color = token.htmlStyle?.color ?? token.color;
				if (color) {
					span.setAttribute("style", `color: ${color}`);
				}
				span.textContent = token.content;
				block.element.appendChild(span as unknown as globalThis.Node);
			}
		}
	}
}
