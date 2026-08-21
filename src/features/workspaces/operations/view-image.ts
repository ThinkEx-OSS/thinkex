import { env } from "cloudflare:workers";

import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/ai/chat-attachment-policy";
import { isWorkspaceItemContainer, type WorkspaceItem } from "#/features/workspaces/contracts";
import { normalizeChatImageToJpeg } from "#/features/workspaces/conversion/image-normalizer";
import { parseWorkspaceAddress } from "#/features/workspaces/locations/workspace-location";
import { resolveWorkspaceFileTypeFromItem } from "#/features/workspaces/model/workspace-file";
import type { WorkspaceAccessContext } from "#/features/workspaces/operations/workspace-access-context";
import { authorizeWorkspaceOperation } from "#/features/workspaces/operations/workspace-operation-context";
import { readWorkspaceFileSource } from "#/features/workspaces/persistence/workspace-files";
import {
	getWorkspaceItemRefKeyIndex,
	resolveWorkspacePaths,
} from "#/features/workspaces/persistence/workspace-items";

export interface WorkspaceImagePixels {
	bytes: ArrayBuffer;
	mediaType: "image/jpeg";
	path: string;
	sizeBytes: number;
}

/**
 * Loads one workspace image file's pixels for the model: source bytes from R2,
 * downscaled and re-encoded with the same profile as chat attachments. Errors
 * carry model-facing guidance — a missing target or a non-image item names the
 * tool that can read it instead.
 */
export async function viewWorkspaceImageOperation(
	accessContext: WorkspaceAccessContext,
	input: { path?: string; ref?: string },
): Promise<WorkspaceImagePixels> {
	await authorizeWorkspaceOperation({ access: "read", context: accessContext });

	const { item, path } = await resolveImageTarget(accessContext.workspaceId, input);
	const fileType = resolveWorkspaceFileTypeFromItem(item);
	if (!fileType) {
		throw new Error(
			`${path} is a ${item.type}, not an image file. Read it with workspace_read_items instead.`,
		);
	}
	if (fileType.assetKind !== "image") {
		throw new Error(
			`${path} is a ${fileType.assetKind} file, not an image. Read it with workspace_read_items instead.`,
		);
	}

	const source = await readWorkspaceFileSource({
		itemId: item.id,
		workspaceId: accessContext.workspaceId,
	});
	const object = await env.WORKSPACE_FILES.get(source.objectKey);
	if (!object) {
		throw new Error(`The stored bytes for ${path} were not found.`);
	}

	const normalized = await normalizeChatImageToJpeg(
		env,
		object.body,
		WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxNormalizedFileSize,
	);
	return {
		bytes: normalized.bytes,
		mediaType: normalized.contentType,
		path,
		sizeBytes: normalized.sizeBytes,
	};
}

async function resolveImageTarget(
	workspaceId: string,
	input: { path?: string; ref?: string },
): Promise<{ item: WorkspaceItem; path: string }> {
	if (input.path) {
		const [resolution] = await resolveWorkspacePaths({ paths: [input.path], workspaceId });
		if (!resolution || resolution.status === "invalid_path") {
			throw new Error("Workspace paths must be absolute, like /Notes/diagram.png.");
		}
		if (resolution.status !== "item" || isWorkspaceItemContainer(resolution.item.type)) {
			throw new Error(`No workspace image exists at ${input.path}.`);
		}
		return { item: resolution.item, path: resolution.path };
	}

	const address = input.ref ? parseWorkspaceAddress(input.ref) : undefined;
	if (!address) {
		throw new Error("Pass either an absolute workspace path or an item ref.");
	}
	const resolved = (await getWorkspaceItemRefKeyIndex({ workspaceId })).get(address.refKey);
	if (!resolved || isWorkspaceItemContainer(resolved.item.type)) {
		throw new Error(`No workspace item matches ${input.ref}.`);
	}
	return resolved;
}
