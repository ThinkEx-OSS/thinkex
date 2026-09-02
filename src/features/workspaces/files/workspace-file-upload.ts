import { toast } from "sonner";

import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { workspaceFileUploadLimits } from "#/features/workspaces/model/workspace-file";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";
import { uploadFileDirectlyToR2 } from "#/features/workspaces/upload/workspace-file-direct-upload-client";
import { partitionWorkspaceUploadSelection } from "#/features/workspaces/upload/workspace-upload-intake";
import {
	type CompleteWorkspaceDirectUploadInput,
	type WorkspaceDirectUploadSession,
} from "#/features/workspaces/upload/workspace-file-upload-protocol";
import { capturePostHogClientException } from "#/integrations/posthog/provider";
import { apiErrorSchema } from "#/lib/api/contracts";
import { getErrorMessage } from "#/lib/error-message";

interface WorkspaceFileUploadJob {
	workspaceId: string;
	parentId: string | null;
	ownerItemId?: string | null;
	file: File;
	onProgress: (loadedBytes: number) => void;
	signal: AbortSignal;
}

interface WorkspaceFileUploadBatchInput {
	workspaceId: string;
	parentId: string | null;
	files: readonly File[];
	onLimitReached: (result: { successCount: number; total: number }) => void;
	onSuccess: (command: WorkspaceCommandResult<WorkspaceItem>) => void;
}

type WorkspaceFileUploadOutcome =
	| {
			command: WorkspaceCommandResult<WorkspaceItem>;
			ok: true;
	  }
	| {
			error: Error;
			ok: false;
	  };

const uploadRequestTimeoutMs = 5 * 60_000;

export async function runWorkspaceFileUploadBatch(
	input: WorkspaceFileUploadBatchInput,
): Promise<void> {
	const { accepted, rejected } = partitionWorkspaceUploadSelection(input.files);

	for (const rejection of rejected) {
		toast.error(`${rejection.file.name}: ${rejection.message}`);
	}

	if (accepted.length === 0) {
		return;
	}

	const controller = new AbortController();
	const cancelAction = {
		label: "Cancel",
		onClick: () => controller.abort(new DOMException("Upload canceled.", "AbortError")),
	};
	const totalBytes = accepted.reduce((total, file) => total + file.size, 0);
	const loadedBytesByFile = new Map(accepted.map((file) => [file, 0]));
	const toastId = toast.loading(getUploadBatchStageMessage("uploading", accepted, 0), {
		action: cancelAction,
		duration: Number.POSITIVE_INFINITY,
	});
	const showUploadError = (error: unknown) => {
		toast.error(getUploadBatchErrorMessage(error, controller.signal), {
			action: undefined,
			description: undefined,
			duration: 5_000,
			id: toastId,
		});
	};
	let lastProgressPercent = -1;
	const onProgress = (file: File, loadedBytes: number) => {
		loadedBytesByFile.set(file, Math.min(file.size, loadedBytes));
		const loadedTotal = Array.from(loadedBytesByFile.values()).reduce(
			(total, loaded) => total + loaded,
			0,
		);
		const percent = Math.floor((loadedTotal / totalBytes) * 100);

		if (percent === lastProgressPercent) {
			return;
		}
		lastProgressPercent = percent;
		toast.loading(
			getUploadBatchStageMessage(percent === 100 ? "finalizing" : "uploading", accepted, percent),
			{
				action: cancelAction,
				duration: Number.POSITIVE_INFINITY,
				id: toastId,
			},
		);
	};

	try {
		const outcomes = await uploadAcceptedFiles({
			files: accepted,
			onProgress,
			onSuccess: input.onSuccess,
			parentId: input.parentId,
			signal: controller.signal,
			workspaceId: input.workspaceId,
		});
		const failures = outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome.error]));
		const successCount = outcomes.length - failures.length;
		const limitReached = failures.some(isWorkspaceUploadLimitError);
		const reportableFailure = failures.find(
			(failure) => !isWorkspaceUploadAbortError(failure) && !isWorkspaceUploadLimitError(failure),
		);

		if (reportableFailure) {
			capturePostHogClientException(reportableFailure, {
				operation: "workspace_file_upload",
				upload_error_count: failures.length,
				upload_skipped_count: rejected.length,
				upload_success_count: successCount,
			});
		}

		if (limitReached) {
			toast.dismiss(toastId);
			input.onLimitReached({ successCount, total: accepted.length });
			return;
		}

		if (successCount === 0) {
			showUploadError(failures[0]);
			return;
		}

		toast.success(getUploadBatchSuccessMessage(successCount, failures.length, accepted.length), {
			action: undefined,
			description: undefined,
			duration: 3_000,
			id: toastId,
		});
	} catch (error) {
		showUploadError(error);
		throw error;
	}
}

/**
 * Uploads one image that lives inside another item — a paste into a document
 * or card — rather than in the file list. The created file item is hidden,
 * unmetered, and purged with its owner. Resolves to the created item whose id
 * the embedding image node stores.
 */
export async function uploadWorkspaceImageForItem(input: {
	file: File;
	ownerItemId: string;
	workspaceId: string;
}): Promise<WorkspaceItem> {
	const command = await uploadWorkspaceFile({
		file: input.file,
		onProgress: () => {},
		ownerItemId: input.ownerItemId,
		parentId: null,
		signal: new AbortController().signal,
		workspaceId: input.workspaceId,
	});
	return command.result;
}

/**
 * Asks the server to download a public web image and store it as an
 * owner-bound workspace image — how an external image in pasted rich content
 * becomes real workspace content instead of a hotlink that rots.
 */
export async function importWorkspaceImageFromUrl(input: {
	ownerItemId: string;
	url: string;
	workspaceId: string;
}): Promise<WorkspaceItem> {
	const command = await requestUploadJson<WorkspaceCommandResult<WorkspaceItem>>(
		`/api/v1/workspaces/${input.workspaceId}/file-upload?action=import-image`,
		{
			body: JSON.stringify({ ownerItemId: input.ownerItemId, url: input.url }),
			headers: { "content-type": "application/json" },
			method: "POST",
			signal: AbortSignal.timeout(uploadRequestTimeoutMs),
		},
	);
	return command.result;
}

async function uploadWorkspaceFile(
	job: WorkspaceFileUploadJob,
): Promise<WorkspaceCommandResult<WorkspaceItem>> {
	const endpoint = `/api/v1/workspaces/${job.workspaceId}/file-upload`;
	const contentType = job.file.type || "application/octet-stream";
	const session = await requestUploadJson<WorkspaceDirectUploadSession>(
		`${endpoint}?action=initiate`,
		{
			body: JSON.stringify({
				contentType,
				fileName: job.file.name,
				fileSize: job.file.size,
				ownerItemId: job.ownerItemId ?? null,
				parentId: job.parentId,
			}),
			headers: { "content-type": "application/json" },
			method: "POST",
			signal: getUploadRequestSignal(job.signal),
		},
	);

	await uploadFileDirectlyToR2({
		contentType,
		file: job.file,
		onProgress: job.onProgress,
		signal: job.signal,
		url: session.uploadUrl,
	});

	return requestUploadJson<WorkspaceCommandResult<WorkspaceItem>>(`${endpoint}?action=complete`, {
		body: JSON.stringify({
			completionToken: session.completionToken,
		} satisfies CompleteWorkspaceDirectUploadInput),
		headers: { "content-type": "application/json" },
		method: "POST",
		signal: getUploadRequestSignal(job.signal),
	});
}

async function settleWorkspaceFileUpload(
	job: WorkspaceFileUploadJob,
): Promise<WorkspaceFileUploadOutcome> {
	try {
		return { command: await uploadWorkspaceFile(job), ok: true };
	} catch (error) {
		return {
			error: error instanceof Error ? error : new Error("Unable to upload file."),
			ok: false,
		};
	}
}

async function requestUploadJson<T>(url: string, init: RequestInit): Promise<T> {
	const response = await fetch(url, init);

	if (!response.ok) {
		throw await getWorkspaceFileUploadError(response);
	}

	return (await response.json()) as T;
}

async function uploadAcceptedFiles(input: {
	workspaceId: string;
	parentId: string | null;
	files: readonly File[];
	onProgress: (file: File, loadedBytes: number) => void;
	onSuccess: (command: WorkspaceCommandResult<WorkspaceItem>) => void;
	signal: AbortSignal;
}): Promise<WorkspaceFileUploadOutcome[]> {
	const jobs = input.files.map((file) => ({
		file,
		onProgress: (loadedBytes: number) => input.onProgress(file, loadedBytes),
		parentId: input.parentId,
		signal: input.signal,
		workspaceId: input.workspaceId,
	}));
	let nextJobIndex = 0;

	const runWorker = async () => {
		const outcomes: WorkspaceFileUploadOutcome[] = [];

		while (true) {
			const job = jobs[nextJobIndex++];

			if (!job) {
				return outcomes;
			}

			const outcome = await settleWorkspaceFileUpload(job);

			if (outcome.ok) {
				input.onSuccess(outcome.command);
			}
			outcomes.push(outcome);
		}
	};
	const workerCount = Math.min(workspaceFileUploadLimits.concurrency, jobs.length);
	const workerOutcomes = await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

	return workerOutcomes.flat();
}

class WorkspaceFileUploadRequestError extends Error {
	constructor(
		message: string,
		readonly code: string,
	) {
		super(message);
	}
}

async function getWorkspaceFileUploadError(response: Response) {
	const fallback = "Unable to upload file to workspace storage.";

	try {
		const payload = apiErrorSchema.safeParse(await response.json());

		return payload.success
			? new WorkspaceFileUploadRequestError(payload.data.message, payload.data.code)
			: new Error(fallback);
	} catch {
		return new Error(fallback);
	}
}

function getUploadBatchStageMessage(
	stage: "finalizing" | "uploading",
	files: readonly File[],
	percent?: number,
) {
	const action = stage === "finalizing" ? "Finalizing" : "Uploading";
	const progress = stage === "uploading" && percent !== undefined ? ` ${percent}%` : "";
	if (files.length === 1) {
		return `${action} ${files[0]?.name ?? "file"}...${progress}`;
	}

	return `${action} ${files.length} files...${progress}`;
}

function getUploadBatchErrorMessage(error: unknown, signal: AbortSignal) {
	if (signal.aborted) {
		return "Upload canceled.";
	}
	if (error instanceof DOMException && error.name === "TimeoutError") {
		return "Upload processing took too long. Please try again.";
	}
	return getErrorMessage(error, "Unable to upload files right now.");
}

function isWorkspaceUploadAbortError(error: Error) {
	return error instanceof DOMException && error.name === "AbortError";
}

function isWorkspaceUploadLimitError(error: Error) {
	return error instanceof WorkspaceFileUploadRequestError && error.code === "upload_limit_reached";
}

function getUploadRequestSignal(signal: AbortSignal) {
	return AbortSignal.any([signal, AbortSignal.timeout(uploadRequestTimeoutMs)]);
}

function getUploadBatchSuccessMessage(successCount: number, errorCount: number, total: number) {
	if (total === 1) {
		return "Uploaded 1 file.";
	}

	if (errorCount === 0) {
		return `Uploaded ${successCount} files.`;
	}

	return `Uploaded ${successCount} of ${total} files.`;
}
