export interface WorkspaceDirectUploadSession {
	completionToken: string;
	uploadUrl: string;
}

export interface CompleteWorkspaceDirectUploadInput {
	completionToken: string;
}
