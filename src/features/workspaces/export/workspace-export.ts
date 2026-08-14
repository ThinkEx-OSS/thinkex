import { env } from "cloudflare:workers";

import { normalizeWorkspaceItemName } from "#/features/workspaces/defaults";
import { type WorkspaceItem, getWorkspaceItemContentKind } from "#/features/workspaces/contracts";
import {
	parseTiptapDocumentJson,
	type TiptapDocumentJson,
} from "#/features/workspaces/documents/tiptap-document";
import { createWorkspaceExportStream } from "#/features/workspaces/export/workspace-export-archive";
import { type FlashcardSetContent } from "#/features/workspaces/flashcards/flashcard-content";
import { canExportWorkspaceEstimate } from "#/features/workspaces/export/workspace-export-limit";
import { readWorkspaceDocumentCheckpoint } from "#/features/workspaces/persistence/workspace-document-checkpoints";
import { readFlashcardSet } from "#/features/workspaces/flashcards/flashcard-persistence";
import { readWorkspaceFileSource } from "#/features/workspaces/persistence/workspace-files";
import { WorkspaceForbiddenError } from "#/features/workspaces/server/permissions";
import { getWorkspacePageForUser } from "#/features/workspaces/server/queries";
import { getMetadataNumber } from "#/features/workspaces/model/workspace-file";

const textEncoder = new TextEncoder();

export class WorkspaceExportTooLargeError extends Error {
	constructor() {
		super("Workspace is too large to export.");
		this.name = "WorkspaceExportTooLargeError";
	}
}

interface PreparedWorkspaceExport {
	documents: Map<string, TiptapDocumentJson>;
	flashcards: Map<string, FlashcardSetContent>;
	fileName: string;
	fileObjectKeys: Map<string, string>;
	items: WorkspaceItem[];
}

export async function createWorkspaceExport(input: { workspaceId: string; userId: string }) {
	const prepared = await prepareWorkspaceExport(input);

	return {
		fileName: prepared.fileName,
		stream: createWorkspaceExportStream(prepared.items, {
			readDocument: (item) => {
				const document = prepared.documents.get(item.id);
				if (!document) {
					throw new Error(`Workspace document was not prepared for ${item.name}.`);
				}
				return document;
			},
			readFlashcards: (item) => {
				const set = prepared.flashcards.get(item.id);
				if (!set) throw new Error(`Workspace flashcards were not prepared for ${item.name}.`);
				return set;
			},
			readFile: async (item) => {
				const objectKey = prepared.fileObjectKeys.get(item.id);
				if (!objectKey) {
					throw new Error(`Workspace file was not prepared for ${item.name}.`);
				}
				const object = await env.WORKSPACE_FILES.get(objectKey);
				if (!object) {
					throw new Error(`Workspace file source is missing for ${item.name}.`);
				}
				return object.body;
			},
		}),
	};
}

export async function canExportWorkspace(input: { workspaceId: string; userId: string }) {
	const page = await getWorkspacePageForUser(input.workspaceId, input.userId);
	if (!page) {
		throw new WorkspaceForbiddenError();
	}

	// ponytail: Uploaded files dominate archive size. The 1 GiB safety margin
	// covers documents and ZIP metadata without preparing the whole export twice.
	const estimatedBytes = page.items.reduce(
		(total, item) =>
			total +
			512 +
			(getWorkspaceItemContentKind(item.type) === "file"
				? (getMetadataNumber(item.metadataJson, "sizeBytes") ?? 0)
				: 0),
		0,
	);

	return canExportWorkspaceEstimate(estimatedBytes);
}

async function prepareWorkspaceExport(input: { workspaceId: string; userId: string }) {
	const page = await getWorkspacePageForUser(input.workspaceId, input.userId);
	if (!page) {
		throw new WorkspaceForbiddenError();
	}

	const documents = new Map<string, TiptapDocumentJson>();
	const flashcards = new Map<string, FlashcardSetContent>();
	const fileObjectKeys = new Map<string, string>();
	let estimatedBytes = page.items.length * 512;

	// Resolve fallible metadata before the response starts streaming. Once ZIP
	// bytes are sent, an error can only abort the download and leave a partial archive.
	for (const item of page.items) {
		if (getWorkspaceItemContentKind(item.type) === "document") {
			const { content } = await readWorkspaceDocumentCheckpoint({
				itemId: item.id,
				workspaceId: input.workspaceId,
			});
			estimatedBytes += textEncoder.encode(content).byteLength;
			documents.set(item.id, parseTiptapDocumentJson(content));
			continue;
		}
		if (getWorkspaceItemContentKind(item.type) === "file") {
			const source = await readWorkspaceFileSource({
				itemId: item.id,
				workspaceId: input.workspaceId,
			});
			const object = await env.WORKSPACE_FILES.head(source.objectKey);
			if (!object) {
				throw new Error(`Workspace file source is missing for ${item.name}.`);
			}
			estimatedBytes += object.size;
			fileObjectKeys.set(item.id, source.objectKey);
			continue;
		}
		if (item.type === "flashcard") {
			const set = await readFlashcardSet({ itemId: item.id, workspaceId: input.workspaceId });
			const serialized = JSON.stringify(set);
			estimatedBytes += textEncoder.encode(serialized).byteLength;
			flashcards.set(item.id, set);
		}
	}

	if (!canExportWorkspaceEstimate(estimatedBytes)) {
		throw new WorkspaceExportTooLargeError();
	}

	return {
		documents,
		flashcards,
		fileName: `${normalizeWorkspaceItemName(page.workspace.name, "Workspace")}-${new Date().toISOString().slice(0, 10)}.zip`,
		fileObjectKeys,
		items: page.items,
	} satisfies PreparedWorkspaceExport;
}
