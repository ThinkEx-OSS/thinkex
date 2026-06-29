import { useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, createContext, type ReactNode, use, useCallback, useRef } from "react";

import { applyWorkspaceEventToCache } from "#/features/workspaces/cache";
import { useWorkspaceMutationAccess } from "#/features/workspaces/components/workspace-mutation-access";
import { runWorkspaceFileUploadBatch } from "#/features/workspaces/files/workspace-file-upload";
import { workspaceUploadAccept } from "#/features/workspaces/upload/workspace-upload-intake";

interface WorkspaceFileUploadContextValue {
	requestFileSelection: (onSelectFiles: (files: File[]) => void) => void;
	uploadFiles: (files: Iterable<File>, parentId: string | null) => void;
}

const WorkspaceFileUploadContext = createContext<WorkspaceFileUploadContextValue | null>(null);

export function WorkspaceFileUploadProvider({
	children,
	workspaceId,
}: {
	children: ReactNode;
	workspaceId: string;
}) {
	const queryClient = useQueryClient();
	const { capabilities } = useWorkspaceMutationAccess();
	const inputRef = useRef<HTMLInputElement>(null);
	const onSelectFilesRef = useRef<((files: File[]) => void) | null>(null);

	const uploadFiles = useCallback(
		(files: Iterable<File>, parentId: string | null) => {
			if (!capabilities.canMutateContent) {
				return;
			}

			const fileList = Array.from(files);

			if (fileList.length === 0) {
				return;
			}

			void runWorkspaceFileUploadBatch({
				workspaceId,
				parentId,
				files: fileList,
				onSuccess: (command) => {
					applyWorkspaceEventToCache(queryClient, command.event);
				},
			});
		},
		[capabilities.canMutateContent, queryClient, workspaceId],
	);

	const requestFileSelection = (onSelectFiles: (files: File[]) => void) => {
		onSelectFilesRef.current = onSelectFiles;
		if (inputRef.current) {
			inputRef.current.value = "";
			inputRef.current.click();
		}
	};

	const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
		const selectedFiles = event.currentTarget.files ? Array.from(event.currentTarget.files) : [];

		event.currentTarget.value = "";

		if (selectedFiles.length === 0) {
			return;
		}

		const onSelectFiles = onSelectFilesRef.current;
		onSelectFilesRef.current = null;
		onSelectFiles?.(selectedFiles);
	};

	return (
		<WorkspaceFileUploadContext.Provider value={{ requestFileSelection, uploadFiles }}>
			<input
				ref={inputRef}
				type="file"
				multiple
				accept={workspaceUploadAccept}
				aria-label="Upload files"
				className="hidden"
				tabIndex={-1}
				onChange={handleInputChange}
			/>
			{children}
		</WorkspaceFileUploadContext.Provider>
	);
}

export function useWorkspaceFileUpload() {
	const context = use(WorkspaceFileUploadContext);

	if (!context) {
		throw new Error("useWorkspaceFileUpload must be used within WorkspaceFileUploadProvider.");
	}

	return context;
}
