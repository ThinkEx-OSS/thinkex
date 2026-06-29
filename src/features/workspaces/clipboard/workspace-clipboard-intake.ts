import {
	createWorkspaceClipboardDocumentCandidate,
	type WorkspaceClipboardDocumentCandidate,
} from "#/features/workspaces/clipboard/workspace-clipboard-documents";

export interface WorkspaceClipboardIntake {
	document: WorkspaceClipboardDocumentCandidate | null;
	files: File[];
}

export function createWorkspaceClipboardIntake(
	data: DataTransfer,
): WorkspaceClipboardIntake | null {
	const files = getClipboardFiles(data);
	const document = createWorkspaceClipboardDocumentCandidate({
		html: data.getData("text/html"),
		plainText: data.getData("text/plain"),
	});

	if (!document && files.length === 0) {
		return null;
	}

	return { document, files };
}

function getClipboardFiles(data: DataTransfer) {
	const files = new Map<string, File>();

	for (const file of Array.from(data.files)) {
		files.set(getClipboardFileKey(file), file);
	}

	for (const item of Array.from(data.items)) {
		if (item.kind !== "file") {
			continue;
		}

		const file = item.getAsFile();

		if (file) {
			files.set(getClipboardFileKey(file), file);
		}
	}

	return [...files.values()];
}

function getClipboardFileKey(file: File) {
	return [file.name, file.type, file.size, file.lastModified].join(":");
}
