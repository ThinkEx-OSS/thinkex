import { nanoid } from "nanoid";
import { useMemo } from "react";
import { create } from "zustand";
import type { FileAttachmentData } from "#/features/workspaces/components/ai-chat/ai-chat-attachments";
import { normalizeWorkspaceAiChatAttachmentFile } from "#/features/workspaces/components/ai-chat/chat-attachment-normalization";
import {
	normalizeWorkspaceSelectedQuote,
	type WorkspaceSelectedQuote,
} from "#/features/workspaces/model/workspace-selected-quotes";
import { acceptIncomingFiles } from "#/lib/accept-files";

export type WorkspaceAiComposerDraftFile = FileAttachmentData;

type AddWorkspaceAiComposerDraftFilesOptions = {
	accept?: string;
	maxFileSize?: number;
	maxFiles?: number;
	onError?: (error: WorkspaceAiComposerDraftFileError) => void;
};

type WorkspaceAiComposerDraftFileError = {
	code: "accept" | "max_file_size" | "max_files" | "read";
	message: string;
};

interface WorkspaceAiComposerDraftState {
	filesByWorkspaceId: Record<string, WorkspaceAiComposerDraftFile[] | undefined>;
	quotesByWorkspaceId: Record<string, WorkspaceSelectedQuote[] | undefined>;
	addFiles: (
		workspaceId: string,
		files: File[] | FileList,
		options?: AddWorkspaceAiComposerDraftFilesOptions,
	) => void;
	addQuote: (workspaceId: string, quote: WorkspaceSelectedQuote) => void;
	clearDraftArtifacts: (workspaceId: string) => void;
	clearFiles: (workspaceId: string) => void;
	clearQuotes: (workspaceId: string) => void;
	removeFile: (workspaceId: string, fileId: string) => void;
	removeQuote: (workspaceId: string, quoteId: string) => void;
}

const EMPTY_DRAFT_FILES: WorkspaceAiComposerDraftFile[] = [];
const EMPTY_DRAFT_QUOTES: WorkspaceSelectedQuote[] = [];

export const useWorkspaceAiComposerDraftStore = create<WorkspaceAiComposerDraftState>()(
	(set, get) => ({
		addFiles: (workspaceId, fileList, options) => {
			const current = get().filesByWorkspaceId[workspaceId] ?? EMPTY_DRAFT_FILES;
			const capped = acceptIncomingFiles([...fileList], {
				accept: options?.accept,
				currentCount: current.length,
				maxFileSize: options?.maxFileSize,
				maxFiles: options?.maxFiles,
				onError: options?.onError,
			});

			if (capped.length === 0) {
				return;
			}

			const placeholders = capped.map(createLoadingDraftFile);

			set((state) => ({
				filesByWorkspaceId: {
					...state.filesByWorkspaceId,
					[workspaceId]: [...current, ...placeholders],
				},
			}));

			for (const [index, file] of capped.entries()) {
				const placeholder = placeholders[index];
				if (!placeholder) {
					continue;
				}

				void normalizeWorkspaceAiChatAttachmentFile({ file, workspaceId })
					.then((attachment) => {
						set((state) => markDraftFileReady(state, workspaceId, placeholder.id, attachment));
					})
					.catch((error) => {
						set((state) => removeDraftFile(state, workspaceId, placeholder.id));
						options?.onError?.({
							code: "read",
							message:
								error instanceof Error && error.message.trim()
									? error.message
									: `Could not prepare "${file.name}".`,
						});
					});
			}
		},
		addQuote: (workspaceId, quote) =>
			set((state) => {
				const normalizedQuote = normalizeWorkspaceSelectedQuote(quote);
				if (!normalizedQuote) {
					return state;
				}

				const current = state.quotesByWorkspaceId[workspaceId] ?? EMPTY_DRAFT_QUOTES;

				return {
					quotesByWorkspaceId: {
						...state.quotesByWorkspaceId,
						[workspaceId]: [
							...current.filter((item) => item.id !== normalizedQuote.id),
							normalizedQuote,
						],
					},
				};
			}),
		clearDraftArtifacts: (workspaceId) =>
			set((state) => clearDraftArtifactsForWorkspace(state, workspaceId)),
		clearFiles: (workspaceId) => set((state) => clearFilesForWorkspace(state, workspaceId)),
		clearQuotes: (workspaceId) =>
			set((state) => {
				const current = state.quotesByWorkspaceId[workspaceId] ?? EMPTY_DRAFT_QUOTES;
				if (current.length === 0) {
					return state;
				}

				return {
					quotesByWorkspaceId: {
						...state.quotesByWorkspaceId,
						[workspaceId]: undefined,
					},
				};
			}),
		filesByWorkspaceId: {},
		quotesByWorkspaceId: {},
		removeFile: (workspaceId, fileId) =>
			set((state) => removeDraftFile(state, workspaceId, fileId)),
		removeQuote: (workspaceId, quoteId) =>
			set((state) => {
				const current = state.quotesByWorkspaceId[workspaceId] ?? EMPTY_DRAFT_QUOTES;
				if (!current.some((quote) => quote.id === quoteId)) {
					return state;
				}

				const next = current.filter((quote) => quote.id !== quoteId);
				return {
					quotesByWorkspaceId: {
						...state.quotesByWorkspaceId,
						[workspaceId]: next.length > 0 ? next : undefined,
					},
				};
			}),
	}),
);

export function useWorkspaceAiComposerDraftFiles(workspaceId: string) {
	return useWorkspaceAiComposerDraftStore(
		useMemo(
			() => (state: WorkspaceAiComposerDraftState) =>
				state.filesByWorkspaceId[workspaceId] ?? EMPTY_DRAFT_FILES,
			[workspaceId],
		),
	);
}

export function useWorkspaceAiComposerDraftQuotes(workspaceId: string) {
	return useWorkspaceAiComposerDraftStore(
		useMemo(
			() => (state: WorkspaceAiComposerDraftState) =>
				state.quotesByWorkspaceId[workspaceId] ?? EMPTY_DRAFT_QUOTES,
			[workspaceId],
		),
	);
}

function clearDraftArtifactsForWorkspace(
	state: WorkspaceAiComposerDraftState,
	workspaceId: string,
) {
	return clearQuotesForWorkspace(clearFilesForWorkspace(state, workspaceId), workspaceId);
}

function clearFilesForWorkspace(state: WorkspaceAiComposerDraftState, workspaceId: string) {
	const current = state.filesByWorkspaceId[workspaceId] ?? EMPTY_DRAFT_FILES;
	if (current.length === 0) {
		return state;
	}

	return {
		...state,
		filesByWorkspaceId: {
			...state.filesByWorkspaceId,
			[workspaceId]: undefined,
		},
	};
}

function clearQuotesForWorkspace(state: WorkspaceAiComposerDraftState, workspaceId: string) {
	const current = state.quotesByWorkspaceId[workspaceId] ?? EMPTY_DRAFT_QUOTES;
	if (current.length === 0) {
		return state;
	}

	return {
		...state,
		quotesByWorkspaceId: {
			...state.quotesByWorkspaceId,
			[workspaceId]: undefined,
		},
	};
}

function createLoadingDraftFile(file: File): WorkspaceAiComposerDraftFile {
	return {
		filename: file.name,
		id: nanoid(),
		mediaType: file.type || "application/octet-stream",
		status: "loading",
		type: "file",
	};
}

function markDraftFileReady(
	state: WorkspaceAiComposerDraftState,
	workspaceId: string,
	fileId: string,
	attachment: { fileName: string; mediaType: string; url: string },
) {
	const files = state.filesByWorkspaceId[workspaceId];
	if (!files) {
		return state;
	}

	const index = files.findIndex((file) => file.id === fileId);
	if (index === -1) {
		return state;
	}

	const nextFiles = [...files];
	nextFiles[index] = {
		...nextFiles[index],
		filename: attachment.fileName,
		mediaType: attachment.mediaType,
		status: "ready",
		url: attachment.url,
	};

	return {
		...state,
		filesByWorkspaceId: {
			...state.filesByWorkspaceId,
			[workspaceId]: nextFiles,
		},
	};
}

function removeDraftFile(
	state: WorkspaceAiComposerDraftState,
	workspaceId: string,
	fileId: string,
) {
	const current = state.filesByWorkspaceId[workspaceId] ?? EMPTY_DRAFT_FILES;
	if (!current.some((file) => file.id === fileId)) {
		return state;
	}

	const next = current.filter((file) => file.id !== fileId);
	return {
		...state,
		filesByWorkspaceId: {
			...state.filesByWorkspaceId,
			[workspaceId]: next.length > 0 ? next : undefined,
		},
	};
}
