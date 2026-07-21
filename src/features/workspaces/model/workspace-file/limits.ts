export const workspaceFileUploadLimits = {
	maxFilesPerSelection: 50,
	maxFileBytes: 100 * 1024 * 1024,
	maxSelectionBytes: 100 * 1024 * 1024,
	maxDocumentImportBytes: 10 * 1024 * 1024,
	concurrency: 3,
} as const;
