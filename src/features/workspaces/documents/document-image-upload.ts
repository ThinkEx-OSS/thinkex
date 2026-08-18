import type { Editor } from "@tiptap/core";
import { toast } from "sonner";

import { uploadWorkspaceImageForItem } from "#/features/workspaces/files/workspace-file-upload";
import { getWorkspaceUploadValidationError } from "#/features/workspaces/upload/workspace-upload-intake";
import { getErrorMessage } from "#/lib/error-message";

export interface DocumentImageUploadTarget {
	/** The document the images ride inside — becomes their hidden owner. */
	documentItemId: string;
	editor: Editor;
	workspaceId: string;
}

/**
 * Starts an upload for every image in a paste or drop and inserts each image
 * node when its upload lands. Returns whether any image was taken, so the
 * caller can claim the event; non-image files are left for other handlers.
 * Insertion waits for the upload because an id-less node would sync to other
 * collaborators as broken — a toast covers the couple of seconds in between.
 */
export function insertDocumentImageFiles(
	target: DocumentImageUploadTarget,
	files: readonly File[],
): boolean {
	const images = files.filter((file) => file.type.startsWith("image/"));
	if (images.length === 0) {
		return false;
	}
	for (const file of images) {
		void uploadAndInsertDocumentImage(target, file);
	}
	return true;
}

async function uploadAndInsertDocumentImage(target: DocumentImageUploadTarget, sourceFile: File) {
	// Clipboard image files often arrive nameless; uploads require a name.
	const file = sourceFile.name
		? sourceFile
		: new File([sourceFile], `Pasted image.${sourceFile.type.split("/")[1] ?? "png"}`, {
				type: sourceFile.type,
			});
	const validationError = getWorkspaceUploadValidationError({
		contentType: file.type,
		fileName: file.name,
		sizeBytes: file.size,
	});
	if (validationError) {
		toast.error(validationError.message);
		return;
	}

	const upload = uploadWorkspaceImageForItem({
		file,
		ownerItemId: target.documentItemId,
		workspaceId: target.workspaceId,
	});
	toast.promise(upload, {
		loading: "Adding image...",
		success: "Image added.",
		error: (error: unknown) => getErrorMessage(error, "Unable to add this image right now."),
	});

	try {
		const item = await upload;
		target.editor
			.chain()
			.focus()
			.insertContent({ type: "image", attrs: { itemId: item.id } })
			.run();
	} catch {
		// The toast already reported the failure; there is no node to clean up.
	}
}
