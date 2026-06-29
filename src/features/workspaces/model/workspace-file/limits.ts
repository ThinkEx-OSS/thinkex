export const workspaceFileUploadLimits = {
	maxFilesPerSelection: 50,
	maxBytesPerSelection: 200 * 1024 * 1024,
	concurrency: 5,
} as const;
