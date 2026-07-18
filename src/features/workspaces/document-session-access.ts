import { getDocumentSessionRoomName } from "#/features/workspaces/agent-routes";
import type { DocumentSessionApplyMarkdownEditsResult } from "#/features/workspaces/documents/document-session";
import type { DocumentMarkdownEdit } from "#/features/workspaces/documents/document-markdown-edits";

export interface DocumentSessionClient {
	applyMarkdownEdits(input: {
		edits: DocumentMarkdownEdit[];
	}): Promise<DocumentSessionApplyMarkdownEditsResult>;
	readMarkdown(): Promise<{ markdown: string; revision: string }>;
	purgeForDeletion(): Promise<void>;
}

export function getDocumentSessionFromEnv(
	env: Cloudflare.Env,
	input: { itemId: string; workspaceId: string },
): DocumentSessionClient {
	return env.DocumentSession.getByName(getDocumentSessionRoomName(input)) as DocumentSessionClient;
}
