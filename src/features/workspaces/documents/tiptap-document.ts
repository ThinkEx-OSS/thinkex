import { type JsonValue } from "#/features/workspaces/contracts";
import { getTiptapDocumentSchema } from "#/features/workspaces/documents/tiptap-schema";

export interface TiptapDocumentJson {
	type: "doc";
	content?: JsonValue[];
	[key: string]: JsonValue | undefined;
}

export interface TiptapDocumentProjection {
	document: TiptapDocumentJson;
	warnings: string[];
}

export function createInitialTiptapDocumentJson(): TiptapDocumentJson {
	return {
		type: "doc",
		content: [{ type: "paragraph" }],
	};
}

export function parseTiptapDocumentJson(content: string | null): TiptapDocumentJson {
	if (!content?.trim()) {
		throw new Error("Workspace document content is missing.");
	}

	return coerceTiptapDocumentProjection(JSON.parse(content)).document;
}

export function stringifyTiptapDocumentJson(document: TiptapDocumentJson) {
	const { document: normalized } = coerceTiptapDocumentProjection(document);

	return `${JSON.stringify(normalized)}\n`;
}

/** Canonical ingest for Tiptap JSON from markdown, Yjs, or kernel storage. */
export function coerceTiptapDocumentJson(value: unknown): TiptapDocumentJson {
	return coerceTiptapDocumentProjection(value).document;
}

export function coerceTiptapDocumentProjection(value: unknown): TiptapDocumentProjection {
	return normalizeTiptapDocumentJson(stripUndefinedFromTiptapJson(value));
}

function stripUndefinedFromTiptapJson(value: unknown): unknown {
	if (value === undefined) {
		return undefined;
	}

	if (value === null || typeof value !== "object") {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map(stripUndefinedFromTiptapJson).filter((entry) => entry !== undefined);
	}

	const sanitized: Record<string, unknown> = {};

	for (const [key, entry] of Object.entries(value)) {
		if (entry === undefined) {
			continue;
		}

		sanitized[key] = stripUndefinedFromTiptapJson(entry);
	}

	return sanitized;
}

function normalizeTiptapDocumentJson(value: unknown): TiptapDocumentProjection {
	if (!isRecord(value) || value.type !== "doc") {
		throw new Error("Workspace document content is not Tiptap JSON.");
	}

	const warnings: string[] = [];
	const content = Array.isArray(value.content)
		? value.content.flatMap((node, index) => {
				if (isJsonValue(node)) {
					return [node];
				}

				warnings.push(
					`Dropped unsupported document content node at index ${index} (${describeDroppedNode(node)}).`,
				);
				return [];
			})
		: undefined;

	const document = coerceProseMirrorDocumentJson(
		{
			...(value as Record<string, JsonValue>),
			type: "doc",
			content: content && content.length > 0 ? content : [{ type: "paragraph" }],
		},
		warnings,
	);

	return { document, warnings };
}

function coerceProseMirrorDocumentJson(
	document: TiptapDocumentJson,
	warnings: string[],
): TiptapDocumentJson {
	const schema = getTiptapDocumentSchema();

	try {
		const node = schema.nodeFromJSON(document);
		node.check();
		return node.toJSON() as TiptapDocumentJson;
	} catch {
		warnings.push("Repaired invalid document structure.");
		return createInitialTiptapDocumentJson();
	}
}

function describeDroppedNode(node: unknown) {
	if (isRecord(node) && typeof node.type === "string") {
		return `type: ${node.type}`;
	}

	return `value: ${typeof node}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
	if (
		value === null ||
		typeof value === "string" ||
		typeof value === "number" ||
		typeof value === "boolean"
	) {
		return true;
	}

	if (Array.isArray(value)) {
		return value.every(isJsonValue);
	}

	if (isRecord(value)) {
		return Object.values(value).every(isJsonValue);
	}

	return false;
}
