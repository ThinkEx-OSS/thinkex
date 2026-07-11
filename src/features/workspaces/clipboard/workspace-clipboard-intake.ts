import {
	createWorkspaceClipboardDocumentCandidate,
	type WorkspaceClipboardDocumentCandidate,
} from "#/features/workspaces/clipboard/workspace-clipboard-documents";

export interface WorkspaceClipboardIntake {
	document: WorkspaceClipboardDocumentCandidate | null;
	files: File[];
}

interface WorkspaceClipboardData {
	files: Iterable<File>;
	getData(format: string): string;
	items: Iterable<Pick<DataTransferItem, "getAsFile" | "kind">>;
}

export function createWorkspaceClipboardIntake(
	data: WorkspaceClipboardData,
): WorkspaceClipboardIntake | null {
	const files = getClipboardFiles(data);
	const document =
		files.length === 0
			? createWorkspaceClipboardDocumentCandidate({
					html: data.getData("text/html"),
					plainText: data.getData("text/plain"),
				})
			: null;

	if (!document && files.length === 0) {
		return null;
	}

	return { document, files };
}

function getClipboardFiles(data: WorkspaceClipboardData) {
	const files = Array.from(data.files);

	if (files.length > 0) {
		return files;
	}

	for (const item of Array.from(data.items)) {
		if (item.kind !== "file") {
			continue;
		}

		const file = item.getAsFile();

		if (file) {
			files.push(file);
		}
	}

	return files;
}
