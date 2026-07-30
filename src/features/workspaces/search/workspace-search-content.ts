import { serializeTiptapDocumentToMarkdown } from "#/features/workspaces/documents/document-markdown";
import { parseTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { iterateWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import { chunkWorkspaceSearchText } from "#/features/workspaces/search/workspace-search-chunks";

const maximumIndexedCharactersPerItem = 8_000_000;

export interface WorkspaceSearchFileSystem {
	readFile(path: string): Promise<string | null>;
}

interface WorkspaceSearchIndexSourceBase {
	itemId: string;
	name: string;
	path: string;
	sourceVersion: string;
}

export type WorkspaceSearchIndexSource = WorkspaceSearchIndexSourceBase &
	(
		| { shellPath: string; type: "document" }
		| { objectKey: string; sourceHash: string; type: "file" }
	);

export interface PreparedWorkspaceSearchChunk {
	content: string;
	endLine: number | null;
	index: number;
	pageNumber: number | null;
	startLine: number | null;
}

export async function prepareWorkspaceSearchChunks(input: {
	bucket: R2Bucket;
	source: WorkspaceSearchIndexSource;
	workspace: WorkspaceSearchFileSystem;
}): Promise<PreparedWorkspaceSearchChunk[]> {
	if (input.source.type === "document") {
		const checkpoint = await input.workspace.readFile(input.source.shellPath);
		if (checkpoint === null) {
			throw new Error("Workspace document checkpoint was not found.");
		}
		const markdown = serializeTiptapDocumentToMarkdown(parseTiptapDocumentJson(checkpoint));
		const searchable = markdown.slice(0, maximumIndexedCharactersPerItem);

		return chunkWorkspaceSearchText(searchable).map((chunk, index) => ({
			content: chunk.content,
			endLine: chunk.endLine,
			index,
			pageNumber: null,
			startLine: chunk.startLine,
		}));
	}

	const chunks: PreparedWorkspaceSearchChunk[] = [];
	let indexedCharacters = 0;

	for await (const page of iterateWorkspacePageProjection({
		bucket: input.bucket,
		expectedSourceHash: input.source.sourceHash,
		manifestObjectKey: input.source.objectKey,
	})) {
		const remaining = maximumIndexedCharactersPerItem - indexedCharacters;
		if (remaining <= 0) {
			break;
		}

		const markdown = page.markdown.slice(0, remaining);
		for (const chunk of chunkWorkspaceSearchText(markdown)) {
			chunks.push({
				content: chunk.content,
				endLine: null,
				index: chunks.length,
				pageNumber: page.pageNumber,
				startLine: null,
			});
		}
		indexedCharacters += markdown.length;

		if (markdown.length < page.markdown.length) {
			break;
		}
	}

	return chunks;
}

export function createWorkspaceSearchEmbeddingText(input: {
	content: string;
	path: string;
	title: string;
}) {
	return [`Title: ${input.title}`, `Path: ${input.path}`, "", input.content].join("\n");
}
