import { serializeTiptapDocumentToMarkdown } from "#/features/workspaces/documents/document-markdown";
import { parseTiptapDocumentJson } from "#/features/workspaces/documents/tiptap-document";
import { iterateWorkspacePageProjection } from "#/features/workspaces/extraction/workspace-page-projection";
import { iterateWorkspaceSearchTextChunks } from "#/features/workspaces/search/workspace-search-chunks";

export interface WorkspaceSearchFileSystem {
	readFile(path: string): Promise<string | null>;
}

interface WorkspaceSearchIndexSourceBase {
	itemId: string;
	name: string;
	sourceVersion: string;
}

export type WorkspaceSearchIndexSource = WorkspaceSearchIndexSourceBase &
	(
		| { shellPath: string; type: "document" }
		| { objectKey: string; sourceHash: string; type: "file" }
	);

interface PreparedWorkspaceSearchChunk {
	content: string;
	endLine: number | null;
	index: number;
	pageNumber: number | null;
	startLine: number | null;
}

export async function* iteratePreparedWorkspaceSearchChunks(input: {
	bucket: R2Bucket;
	source: WorkspaceSearchIndexSource;
	workspace: WorkspaceSearchFileSystem;
}): AsyncGenerator<PreparedWorkspaceSearchChunk> {
	let index = 0;

	if (input.source.type === "document") {
		const checkpoint = await input.workspace.readFile(input.source.shellPath);
		if (checkpoint === null) {
			throw new Error("Workspace document checkpoint was not found.");
		}
		const markdown = serializeTiptapDocumentToMarkdown(parseTiptapDocumentJson(checkpoint));
		for (const chunk of iterateWorkspaceSearchTextChunks(markdown)) {
			yield {
				content: chunk.content,
				endLine: chunk.endLine,
				index,
				pageNumber: null,
				startLine: chunk.startLine,
			};
			index += 1;
		}
		return;
	}

	for await (const page of iterateWorkspacePageProjection({
		bucket: input.bucket,
		expectedSourceHash: input.source.sourceHash,
		manifestObjectKey: input.source.objectKey,
	})) {
		for (const chunk of iterateWorkspaceSearchTextChunks(page.markdown)) {
			yield {
				content: chunk.content,
				endLine: null,
				index,
				pageNumber: page.pageNumber,
				startLine: null,
			};
			index += 1;
		}
	}
}

export function createWorkspaceSearchEmbeddingText(input: { content: string; title: string }) {
	return [`Title: ${input.title}`, "", input.content].join("\n");
}
