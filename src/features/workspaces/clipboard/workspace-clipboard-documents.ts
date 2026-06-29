import { generateJSON } from "@tiptap/core";

import { plainTextToTiptapDocument } from "#/features/workspaces/documents/plain-text-document";
import {
	coerceTiptapDocumentJson,
	stringifyTiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import { getTiptapDocumentSchemaExtensions } from "#/features/workspaces/documents/tiptap-schema";

export interface WorkspaceClipboardDocumentCandidate {
	initialContent: string;
	name: string;
	removedMediaCount: number;
	source: "formatted" | "plain";
}

const removedHtmlSelectors = [
	"img",
	"picture",
	"source",
	"svg",
	"canvas",
	"video",
	"audio",
	"iframe",
	"object",
	"embed",
	"script",
	"style",
	"link",
	"meta",
];

const mediaSelectors = [
	"img",
	"picture",
	"svg",
	"canvas",
	"video",
	"audio",
	"iframe",
	"object",
	"embed",
];

export function createWorkspaceClipboardDocumentCandidate(input: {
	html?: string;
	plainText?: string;
}): WorkspaceClipboardDocumentCandidate | null {
	const html = input.html?.trim();

	if (html) {
		const formatted = createFormattedClipboardDocument(html);

		if (formatted) {
			return formatted;
		}
	}

	const plainText = input.plainText?.trim();

	if (!plainText) {
		return null;
	}

	return {
		initialContent: stringifyTiptapDocumentJson(plainTextToTiptapDocument(plainText)),
		name: getPastedDocumentName(plainText),
		removedMediaCount: 0,
		source: "plain",
	};
}

function createFormattedClipboardDocument(
	html: string,
): WorkspaceClipboardDocumentCandidate | null {
	const doc = new DOMParser().parseFromString(html, "text/html");
	const removedMediaCount = doc.querySelectorAll(mediaSelectors.join(",")).length;

	for (const element of doc.querySelectorAll(removedHtmlSelectors.join(","))) {
		element.remove();
	}
	sanitizeParsedClipboardDocument(doc);

	if (!doc.body.textContent?.trim()) {
		return null;
	}

	try {
		const document = coerceTiptapDocumentJson(
			generateJSON(doc.body.innerHTML, getTiptapDocumentSchemaExtensions()),
		);

		return {
			initialContent: stringifyTiptapDocumentJson(document),
			name: getPastedDocumentName(doc.body.textContent),
			removedMediaCount,
			source: "formatted",
		};
	} catch {
		return null;
	}
}

function sanitizeParsedClipboardDocument(doc: Document) {
	for (const element of doc.body.querySelectorAll("*")) {
		for (const attribute of [...element.attributes]) {
			const name = attribute.name.toLowerCase();

			if (
				name.startsWith("on") ||
				name === "style" ||
				name === "srcdoc" ||
				name === "formaction" ||
				(isUrlAttribute(name) && !isSafeClipboardUrl(attribute.value))
			) {
				element.removeAttribute(attribute.name);
			}
		}
	}
}

function isUrlAttribute(name: string) {
	return name === "href" || name === "src" || name === "xlink:href";
}

function isSafeClipboardUrl(value: string) {
	const trimmed = value.trim();

	if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("/") || trimmed.startsWith("./")) {
		return true;
	}

	try {
		const url = new URL(trimmed, window.location.origin);
		return ["http:", "https:", "mailto:"].includes(url.protocol);
	} catch {
		return false;
	}
}

function getPastedDocumentName(text: string) {
	const firstLine = text.replace(/\s+/g, " ").trim().slice(0, 80);

	return firstLine || "Pasted content";
}
