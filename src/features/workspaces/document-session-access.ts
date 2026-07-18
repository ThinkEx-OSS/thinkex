import { getDocumentSessionRoomName } from "#/features/workspaces/agent-routes";
import type {
	DocumentMarkdownChunkReadInput,
	DocumentMarkdownChunkReadResult,
} from "#/features/workspaces/documents/document-markdown-chunk";
import type { DocumentSessionApplyMarkdownEditsResult } from "#/features/workspaces/documents/document-session";
import type { DocumentMarkdownEdit } from "#/features/workspaces/documents/document-markdown-edits";

export interface DocumentSessionClient {
	applyMarkdownEdits(input: {
		edits: DocumentMarkdownEdit[];
	}): Promise<DocumentSessionApplyMarkdownEditsResult>;
	readMarkdownChunk(
		input: DocumentMarkdownChunkReadInput,
	): Promise<DocumentMarkdownChunkReadResult>;
	purgeForDeletion(): Promise<void>;
}

export function getDocumentSessionFromEnv(
	env: Cloudflare.Env,
	input: { itemId: string; workspaceId: string },
): DocumentSessionClient {
	return env.DocumentSession.getByName(getDocumentSessionRoomName(input)) as DocumentSessionClient;
}
