export const workspaceFileUploadLimits = {
	maxFilesPerSelection: 50,
	maxFileBytes: 200 * 1024 * 1024,
	maxSelectionBytes: 200 * 1024 * 1024,
	maxDocumentImportBytes: 10 * 1024 * 1024,
	concurrency: 3,
} as const;
