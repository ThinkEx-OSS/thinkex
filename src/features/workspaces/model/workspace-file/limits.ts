export const workspaceFileUploadLimits = {
	maxFilesPerSelection: 50,
	maxFileBytes: 100_000_000,
	maxImageFileBytes: 20 * 1024 * 1024,
	maxSelectionBytes: 100_000_000,
	maxDocumentImportBytes: 10 * 1024 * 1024,
	concurrency: 3,
} as const;
