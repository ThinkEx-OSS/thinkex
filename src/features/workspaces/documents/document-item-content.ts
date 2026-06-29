import type { JsonValue, WorkspaceItemType } from "#/features/workspaces/contracts";
import { withDocumentPreviewMetadata } from "#/features/workspaces/documents/document-preview-text";
import { getInitialWorkspaceKernelContent } from "#/features/workspaces/kernel/workspace-kernel-files";
import { parseWorkspaceItemMetadataJson } from "#/features/workspaces/kernel/workspace-kernel-metadata";
import type { WorkspaceKernelSql } from "#/features/workspaces/kernel/workspace-kernel-schema";

export function prepareDocumentItemMetadata(
	metadataJson: Record<string, JsonValue>,
	content: string,
) {
	return withDocumentPreviewMetadata(metadataJson, content);
}

/** Shared create-time content + metadata for kernel writes and optimistic UI. */
export function buildWorkspaceItemCreateBootstrap(input: {
	type: WorkspaceItemType;
	name: string;
	metadataJson?: Record<string, JsonValue>;
	initialContent?: string;
}) {
	const initialContent =
		input.initialContent ?? getInitialWorkspaceKernelContent(input.type, input.name);
	const metadataJson =
		input.type === "document"
			? prepareDocumentItemMetadata(input.metadataJson ?? {}, initialContent)
			: (input.metadataJson ?? {});

	return { initialContent, metadataJson };
}

export function persistDocumentItemContentUpdate(input: {
	content: string;
	itemId: string;
	metadataJson: string;
	sql: WorkspaceKernelSql;
	updatedAt?: number;
}) {
	const metadata = prepareDocumentItemMetadata(
		parseWorkspaceItemMetadataJson(input.metadataJson),
		input.content,
	);
	const updatedAt = input.updatedAt ?? Date.now();

	input.sql`
		UPDATE kernel_items
		SET
			updated_at = ${updatedAt},
			metadata_json = ${JSON.stringify(metadata)}
		WHERE id = ${input.itemId} AND deleted_at IS NULL
	`;
}

export function touchWorkspaceItemUpdatedAt(input: {
	itemId: string;
	sql: WorkspaceKernelSql;
	updatedAt?: number;
}) {
	const updatedAt = input.updatedAt ?? Date.now();

	input.sql`
		UPDATE kernel_items
		SET updated_at = ${updatedAt}
		WHERE id = ${input.itemId} AND deleted_at IS NULL
	`;
}
