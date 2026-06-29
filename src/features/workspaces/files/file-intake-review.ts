import { WORKSPACE_AI_CHAT_ATTACHMENT_POLICY } from "#/features/workspaces/components/ai-chat/constants";
import { getWorkspaceUploadSelectionValidationError } from "#/features/workspaces/upload/workspace-upload-intake";
import { fileMatchesAccept } from "#/lib/file-accept";

export type ReviewedIncomingFileReasonCode =
	| "chat_unsupported"
	| "chat_too_large"
	| "chat_too_many"
	| "workspace_unsupported"
	| "workspace_too_large"
	| "workspace_too_many"
	| "workspace_permission";

export interface ReviewedIncomingFile {
	file: File;
	filename: string;
	reasonCode: ReviewedIncomingFileReasonCode;
	message: string;
}

export function classifyIncomingChatFiles(
	files: readonly File[],
	input: {
		canUploadToWorkspace: boolean;
		currentChatFileCount: number;
	},
) {
	const chatAccepted: File[] = [];
	const workspaceFallback: ReviewedIncomingFile[] = [];
	const rejected: ReviewedIncomingFile[] = [];
	let nextChatFileCount = input.currentChatFileCount;
	let nextWorkspaceFileCount = 0;
	let nextWorkspaceSelectionBytes = 0;

	for (const file of files) {
		const chatRejection = getChatFileRejection(file, { currentChatFileCount: nextChatFileCount });

		if (!chatRejection) {
			chatAccepted.push(file);
			nextChatFileCount += 1;
			continue;
		}

		const workspaceReview = reviewWorkspaceCandidate(file, {
			acceptedCount: nextWorkspaceFileCount,
			selectionBytes: nextWorkspaceSelectionBytes,
			canUploadToWorkspace: input.canUploadToWorkspace,
		});

		if (workspaceReview.accepted) {
			workspaceFallback.push({
				file,
				filename: getReviewedFileName(file),
				reasonCode: chatRejection.reasonCode,
				message: chatRejection.message,
			});
			nextWorkspaceFileCount += 1;
			nextWorkspaceSelectionBytes += file.size;
			continue;
		}

		rejected.push(workspaceReview.reviewedFile);
	}

	return { chatAccepted, workspaceFallback, rejected };
}

export function classifyIncomingWorkspaceFiles(
	files: readonly File[],
	input: {
		canUploadToWorkspace: boolean;
	},
) {
	const accepted: File[] = [];
	const rejected: ReviewedIncomingFile[] = [];
	let nextWorkspaceFileCount = 0;
	let nextWorkspaceSelectionBytes = 0;

	for (const file of files) {
		const review = reviewWorkspaceCandidate(file, {
			acceptedCount: nextWorkspaceFileCount,
			selectionBytes: nextWorkspaceSelectionBytes,
			canUploadToWorkspace: input.canUploadToWorkspace,
		});

		if (!review.accepted) {
			rejected.push(review.reviewedFile);
			continue;
		}

		accepted.push(file);
		nextWorkspaceFileCount += 1;
		nextWorkspaceSelectionBytes += file.size;
	}

	return { accepted, rejected };
}

function getChatFileRejection(
	file: File,
	input: {
		currentChatFileCount: number;
	},
): Omit<ReviewedIncomingFile, "file" | "filename"> | null {
	if (!fileMatchesAccept(file, WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.accept)) {
		return {
			reasonCode: "chat_unsupported",
			message: "This kind of file can't be added to chat.",
		};
	}

	if (file.size > WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxFileSize) {
		return {
			reasonCode: "chat_too_large",
			message: "This file is too large for chat.",
		};
	}

	if (input.currentChatFileCount >= WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxFiles) {
		return {
			reasonCode: "chat_too_many",
			message: `You can attach up to ${WORKSPACE_AI_CHAT_ATTACHMENT_POLICY.maxFiles} files to a chat.`,
		};
	}

	return null;
}

function reviewWorkspaceCandidate(
	file: File,
	input: {
		acceptedCount: number;
		selectionBytes: number;
		canUploadToWorkspace: boolean;
	},
): { accepted: true } | { accepted: false; reviewedFile: ReviewedIncomingFile } {
	if (!input.canUploadToWorkspace) {
		return {
			accepted: false,
			reviewedFile: {
				file,
				filename: getReviewedFileName(file),
				reasonCode: "workspace_permission",
				message: "You don't have permission to add files to this workspace.",
			},
		};
	}

	const validationError = getWorkspaceUploadSelectionValidationError({
		file,
		acceptedCount: input.acceptedCount,
		selectionBytes: input.selectionBytes,
	});

	if (validationError) {
		return {
			accepted: false,
			reviewedFile: {
				file,
				filename: getReviewedFileName(file),
				reasonCode: mapWorkspaceValidationErrorCode(validationError.code),
				message: validationError.message,
			},
		};
	}

	return { accepted: true };
}

function getReviewedFileName(file: File) {
	return file.name.trim() || "Untitled file";
}

function mapWorkspaceValidationErrorCode(
	code:
		| "INVALID_UPLOAD"
		| "UNSUPPORTED_FILE_TYPE"
		| "UPLOAD_TOO_LARGE"
		| "TOO_MANY_FILES"
		| "SELECTION_TOO_LARGE",
): ReviewedIncomingFileReasonCode {
	switch (code) {
		case "INVALID_UPLOAD":
		case "UNSUPPORTED_FILE_TYPE":
			return "workspace_unsupported";
		case "UPLOAD_TOO_LARGE":
		case "SELECTION_TOO_LARGE":
			return "workspace_too_large";
		case "TOO_MANY_FILES":
			return "workspace_too_many";
	}
}
