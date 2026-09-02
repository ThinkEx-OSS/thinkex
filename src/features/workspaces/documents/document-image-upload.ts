import type { Editor } from "@tiptap/core";
import { toast } from "sonner";

import {
	importWorkspaceImageFromUrl,
	uploadWorkspaceImageForItem,
} from "#/features/workspaces/files/workspace-file-upload";
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

const MAX_PASTED_IMAGE_IMPORTS = 10;

/**
 * Imports external images referenced by pasted rich HTML. The schema drops
 * `img[src]` outright — an external URL in a stored document would rot and
 * leak reader IPs — so each image is downloaded server-side into an
 * owner-bound workspace file, then inserted. The pasted text lands first and
 * the images follow it, rather than holding the whole paste hostage to slow
 * downloads.
 */
export function importDocumentImagesFromPastedHtml(
	target: DocumentImageUploadTarget,
	html: string,
): void {
	// A real parse rather than a regex: clipboard HTML entity-encodes query
	// strings (&amp;), quotes vary, and getAttribute decodes all of it.
	const parsed = new DOMParser().parseFromString(html, "text/html");
	const urls = new Set<string>();
	for (const image of Array.from(parsed.querySelectorAll("img"))) {
		const src = image.getAttribute("src") ?? "";
		if (/^https?:\/\//i.test(src)) urls.add(src);
	}
	for (const url of Array.from(urls).slice(0, MAX_PASTED_IMAGE_IMPORTS)) {
		void importAndInsertDocumentImage(target, url);
	}
}

async function importAndInsertDocumentImage(target: DocumentImageUploadTarget, url: string) {
	const importPromise = importWorkspaceImageFromUrl({
		ownerItemId: target.documentItemId,
		url,
		workspaceId: target.workspaceId,
	});
	toast.promise(importPromise, {
		loading: "Adding image from the web...",
		success: "Image added.",
		error: (error: unknown) => getErrorMessage(error, "Unable to add this image right now."),
	});

	try {
		const item = await importPromise;
		target.editor
			.chain()
			.focus()
			.insertContent({ type: "image", attrs: { itemId: item.id } })
			.run();
	} catch {
		// The toast already reported the failure.
	}
}

async function uploadAndInsertDocumentImage(target: DocumentImageUploadTarget, sourceFile: File) {
	// Clipboard image files often arrive nameless; uploads require a name, and
	// the server appends the right extension from the media type. Validation
	// happens server-side at initiate; its message reaches the same toast.
	const file = sourceFile.name
		? sourceFile
		: new File([sourceFile], "Pasted image", { type: sourceFile.type });
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
