import { DOMParser, DOMSerializer, Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import { parseHTML } from "linkedom";
import { nanoid } from "nanoid";

import type { WorkspaceLocation } from "#/features/workspaces/locations/workspace-location";
import {
	coerceTiptapDocumentJson,
	type TiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import {
	getTiptapDocumentSchema,
	tiptapDocumentAiRefAttribute,
} from "#/features/workspaces/documents/tiptap-schema";
import { sha256Base64UrlText } from "#/lib/binary";

const TEXT_NODE = 3;
const documentAiRefPattern = /^b_[A-Za-z0-9_-]{12}$/;
const documentAiTargetRefPattern = /^(b_[A-Za-z0-9_-]{12})\.r_[A-Za-z0-9_-]{10}$/;
export class DocumentAiHtmlError extends Error {}

export interface ParseDocumentAiHtmlOptions {
	/**
	 * Source for a widget the model sent back empty. Reads elide widget source,
	 * so HTML that came from a read carries placeholders — without this they
	 * would be written back as empty widgets, silently destroying the source.
	 */
	resolveWidgetSource?: (ref: string) => string | null;
}

export function parseDocumentAiHtml(
	html: string,
	options: ParseDocumentAiHtmlOptions = {},
): TiptapDocumentJson {
	const htmlDocument = createHtmlDocument();
	htmlDocument.body.innerHTML = html;

	restoreElidedWidgets(htmlDocument, options.resolveWidgetSource);

	// A citation the operation could not resolve to a real item cannot navigate
	// anywhere, so it becomes its own label rather than failing the write.
	for (const element of htmlDocument.body.querySelectorAll("citation:not([data-item-id])")) {
		element.replaceWith(htmlDocument.createTextNode(element.textContent ?? ""));
	}

	rewriteLossyElements(htmlDocument);

	validateDocumentAiHtml(htmlDocument.body);

	for (const element of htmlDocument.body.querySelectorAll("[data-ref]")) {
		element.removeAttribute("data-ref");
	}

	try {
		const document = DOMParser.fromSchema(getTiptapDocumentSchema()).parse(
			htmlDocument.body as unknown as HTMLElement,
		);
		document.check();
		return coerceTiptapDocumentJson(document.toJSON());
	} catch (error) {
		throw new DocumentAiHtmlError("Document HTML does not match the supported schema.", {
			cause: error,
		});
	}
}

export async function serializeTiptapDocumentToAiHtml(document: TiptapDocumentJson) {
	const node = getTiptapDocumentSchema().nodeFromJSON(document);
	return (
		await Promise.all(
			Array.from({ length: node.childCount }, (_, index) =>
				serializeTiptapNodeToAiHtml(node.child(index)),
			),
		)
	).join("");
}

export async function serializeTiptapNodeToAiHtml(node: ProseMirrorNode) {
	// The ref is hashed from the full node, so a widget whose source changed
	// still invalidates it — only the serialized form is elided.
	const withRef = withTiptapNodeAiRef(node, await createDocumentAiTargetRef(node));
	return serializeTiptapFragmentToAiHtml(Fragment.from(elideWidgetSource(withRef)));
}

/**
 * Replaces a widget's source with nothing for the model's benefit.
 *
 * A widget runs to kilobytes of markup and script. Inlining that in every read
 * would crowd out the prose the model actually needs — a handful of widgets
 * would fill a whole chunk. The placeholder keeps the ref and title, which is
 * enough to decide whether to read it in full.
 */
function elideWidgetSource(node: ProseMirrorNode): ProseMirrorNode {
	if (node.type.name !== "widget") {
		return node;
	}
	return node.type.create(node.attrs, undefined, node.marks);
}

export async function createDocumentAiTargetRef(node: ProseMirrorNode) {
	const ref = readTiptapNodeAiRef(node);
	if (!ref) {
		throw new Error(`Top-level document node ${node.type.name} is missing an AI ref.`);
	}

	// Fingerprint the block's JSON rather than its HTML: rendering costs a whole
	// second DOM pass per block per read, and the ref only has to change whenever
	// the block's content does.
	const content = JSON.stringify(withTiptapNodeAiRef(node, null).toJSON());
	const revision = (await sha256Base64UrlText(content)).slice(0, 10);
	return `${ref}.r_${revision}`;
}

export function parseDocumentAiTargetRef(ref: string) {
	return documentAiTargetRefPattern.exec(ref)?.[1] ?? null;
}

export function ensureTiptapDocumentAiRefs(document: TiptapDocumentJson): {
	changed: boolean;
	document: TiptapDocumentJson;
} {
	const refs = ensureProseMirrorDocumentAiRefs(getTiptapDocumentSchema().nodeFromJSON(document));
	return refs.changed
		? { changed: true, document: coerceTiptapDocumentJson(refs.document.toJSON()) }
		: { changed: false, document };
}

export function ensureProseMirrorDocumentAiRefs(document: ProseMirrorNode): {
	changed: boolean;
	document: ProseMirrorNode;
} {
	const usedRefs = new Set<string>();
	let changed = false;
	const children: ProseMirrorNode[] = [];

	document.forEach((node) => {
		const currentRef = readTiptapNodeAiRef(node);
		const ref = currentRef && !usedRefs.has(currentRef) ? currentRef : createDocumentAiRef();
		usedRefs.add(ref);
		changed ||= ref !== currentRef;
		children.push(withTiptapNodeAiRef(node, ref));
	});

	if (!changed) {
		return { changed: false, document };
	}

	return {
		changed: true,
		document: document.type.create(document.attrs, Fragment.fromArray(children)),
	};
}

export function createDocumentAiRef() {
	return `b_${nanoid(12)}`;
}

export function readTiptapNodeAiRef(node: ProseMirrorNode) {
	const ref = node.attrs[tiptapDocumentAiRefAttribute];
	return typeof ref === "string" && documentAiRefPattern.test(ref) ? ref : null;
}

export function withTiptapNodeAiRef(node: ProseMirrorNode, ref: string | null) {
	const attributes = node.type.spec.attrs;
	if (!attributes || !(tiptapDocumentAiRefAttribute in attributes)) {
		throw new Error(`Top-level document node ${node.type.name} cannot carry an AI ref.`);
	}

	return node.type.create(
		{ ...node.attrs, [tiptapDocumentAiRefAttribute]: ref },
		node.content,
		node.marks,
	);
}

/** One block as HTML, synchronously and without a ref — for text matching. */
export function serializeTiptapNodeToPlainAiHtml(node: ProseMirrorNode) {
	return serializeTiptapFragmentToAiHtml(Fragment.from(node));
}

function serializeTiptapFragmentToAiHtml(fragment: Fragment) {
	const htmlDocument = createHtmlDocument();
	const container = htmlDocument.createElement("div");
	const serialized = DOMSerializer.fromSchema(getTiptapDocumentSchema()).serializeFragment(
		fragment,
		{ document: htmlDocument as unknown as Document },
	);
	container.appendChild(serialized as unknown as globalThis.Node);
	return container.innerHTML;
}

/**
 * Fills an elided widget back in from the live document before parsing.
 *
 * The model reads a widget as `<div data-type="widget" data-ref="...">` with no
 * body. Sending that straight back — which `overwrite` does by design — would
 * otherwise replace real source with an empty node.
 */
function restoreElidedWidgets(
	htmlDocument: Document,
	resolveWidgetSource: ((ref: string) => string | null) | undefined,
) {
	for (const element of htmlDocument.body.querySelectorAll('div[data-type="widget"]')) {
		if (element.textContent?.trim()) {
			continue;
		}
		const ref = element.getAttribute("data-ref");
		const source = ref && resolveWidgetSource ? resolveWidgetSource(ref) : null;
		if (source) {
			element.textContent = source;
		}
	}
}

/**
 * Rescues the two tags ProseMirror parses lossily.
 *
 * Everything else outside the schema is already handled by the parser: unknown
 * wrappers are skipped with their children kept, and `<script>`/`<style>` text
 * never reaches the document. These two lose meaning instead:
 *  - `<h5>`/`<h6>` fall all the way to a paragraph, so the heading disappears;
 *    the schema stops at 4, so 4 is where they belong.
 *  - `<sub>`/`<sup>` flatten to bare text (`CH<sub>4</sub>` becomes `CH4`), so
 *    they become inline math instead. `{}_{4}` is the KaTeX form for a
 *    subscript with no base, which is what the tag means on its own.
 *
 * Models write both by habit — evals showed `CH<sub>4</sub>` surviving an
 * explicit instruction not to use it.
 */
function rewriteLossyElements(htmlDocument: Document) {
	for (const element of htmlDocument.body.querySelectorAll("h5, h6")) {
		const heading = htmlDocument.createElement("h4");
		for (const child of Array.from(element.childNodes)) {
			heading.appendChild(child);
		}
		element.replaceWith(heading);
	}

	for (const element of htmlDocument.body.querySelectorAll("sub, sup")) {
		const latex = element.textContent?.trim();
		if (!latex) {
			element.remove();
			continue;
		}

		const math = htmlDocument.createElement("span");
		math.setAttribute("data-type", "inline-math");
		math.setAttribute(
			"data-latex",
			`{}${element.tagName.toLowerCase() === "sub" ? "_" : "^"}{${latex}}`,
		);
		element.replaceWith(math);
	}
}

function validateDocumentAiHtml(root: HTMLElement) {
	// Text sitting at the top level means this is not HTML at all — Markdown,
	// most often, which a model reaches for by habit. ProseMirror would take it
	// without complaint and flatten the whole thing into one paragraph of
	// literal source, so refuse it while the edit can still be reported failed.
	for (const node of root.childNodes) {
		if (node.nodeType === TEXT_NODE && node.textContent?.trim()) {
			throw new DocumentAiHtmlError(
				"Document content must be HTML elements. Plain text and Markdown are not accepted.",
			);
		}
	}
}

/** Short refs the assistant cited, for the caller to resolve to locations. */
export function readDocumentCitationRefs(html: string) {
	const htmlDocument = createHtmlDocument();
	htmlDocument.body.innerHTML = html;

	return [
		...new Set(
			[...htmlDocument.body.querySelectorAll("citation[ref]")].flatMap(
				(element) => element.getAttribute("ref") ?? [],
			),
		),
	];
}

/**
 * Rewrite cited refs to the locations they stand for. A ref belongs to one chat
 * turn; the location outlives it, so that is what the document keeps.
 */
export function applyDocumentCitationLocations(
	html: string,
	locationsByRef: Map<string, WorkspaceLocation>,
) {
	const htmlDocument = createHtmlDocument();
	htmlDocument.body.innerHTML = html;

	for (const element of htmlDocument.body.querySelectorAll("citation[ref]")) {
		const location = locationsByRef.get(element.getAttribute("ref") ?? "");
		element.removeAttribute("ref");

		if (!location) {
			continue;
		}
		element.setAttribute("data-item-id", location.itemId);
		if (location.kind === "pdf-page") {
			element.setAttribute("data-page", String(location.pageNumber));
		}
	}

	return htmlDocument.body.innerHTML;
}

function createHtmlDocument() {
	return parseHTML("<!doctype html><html><body></body></html>").document;
}
