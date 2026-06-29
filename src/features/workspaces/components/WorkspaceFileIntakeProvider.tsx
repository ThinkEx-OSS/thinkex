import { createContext, type ReactNode, use, useCallback, useState } from "react";

import { WorkspaceFileIntakeReviewDialog } from "#/features/workspaces/components/WorkspaceFileIntakeReviewDialog";
import { useWorkspaceFileUpload } from "#/features/workspaces/components/WorkspaceFileUploadProvider";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import {
	classifyIncomingWorkspaceFiles,
	type ReviewedIncomingFile,
} from "#/features/workspaces/files/file-intake-review";

interface WorkspaceFileIntakeContextValue {
	requestFileUpload: (parentId: string | null) => void;
	uploadFiles: (files: Iterable<File>, parentId: string | null) => void;
}

const WorkspaceFileIntakeContext = createContext<WorkspaceFileIntakeContextValue | null>(null);

export function WorkspaceFileIntakeProvider({ children }: { children: ReactNode }) {
	const { capabilities } = useWorkspaceMutationAccess();
	const { requestFileSelection, uploadFiles: uploadRawFiles } = useWorkspaceFileUpload();
	const [rejectedFiles, setRejectedFiles] = useState<ReviewedIncomingFile[]>([]);

	const handleWorkspaceFiles = useCallback(
		(files: Iterable<File>, parentId: string | null) => {
			const review = classifyIncomingWorkspaceFiles(Array.from(files), {
				canUploadToWorkspace: capabilities.canMutateContent,
			});

			if (review.accepted.length > 0) {
				uploadRawFiles(review.accepted, parentId);
			}

			setRejectedFiles(review.rejected);
		},
		[capabilities.canMutateContent, uploadRawFiles],
	);

	const requestFileUpload = useCallback(
		(parentId: string | null) => {
			if (!capabilities.canMutateContent) {
				return;
			}

			requestFileSelection((files) => {
				handleWorkspaceFiles(files, parentId);
			});
		},
		[capabilities.canMutateContent, handleWorkspaceFiles, requestFileSelection],
	);

	return (
		<WorkspaceFileIntakeContext.Provider
			value={{
				requestFileUpload,
				uploadFiles: handleWorkspaceFiles,
			}}
		>
			{children}
			<WorkspaceFileIntakeReviewDialog
				open={rejectedFiles.length > 0}
				mode="workspace_rejection"
				workspaceFallbackFiles={[]}
				rejectedFiles={rejectedFiles}
				onOpenChange={(open) => {
					if (!open) {
						setRejectedFiles([]);
					}
				}}
			/>
		</WorkspaceFileIntakeContext.Provider>
	);
}

export function useWorkspaceFileIntake() {
	const context = use(WorkspaceFileIntakeContext);

	if (!context) {
		throw new Error("useWorkspaceFileIntake must be used within WorkspaceFileIntakeProvider.");
	}

	return context;
}
