export const workspaceExportMaxEstimatedBytes = 3 * 1024 * 1024 * 1024;

export function canExportWorkspaceEstimate(estimatedBytes: number) {
	return estimatedBytes <= workspaceExportMaxEstimatedBytes;
}
