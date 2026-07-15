import { AsyncQueuer } from "@tanstack/pacer";
import { toast } from "sonner";

import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { workspaceFileUploadLimits } from "#/features/workspaces/model/workspace-file";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";
import {
	getWorkspaceUploadAbortReason,
	uploadFileDirectlyToR2,
} from "#/features/workspaces/upload/workspace-file-direct-upload-client";
import { partitionWorkspaceUploadSelection } from "#/features/workspaces/upload/workspace-upload-intake";
import {
	type CompleteWorkspaceDirectUploadInput,
	type WorkspaceDirectUploadSession,
} from "#/features/workspaces/upload/workspace-file-upload-protocol";
import { prepareWorkspaceClientMutationInput } from "#/features/workspaces/use-workspace-client-mutation-echo";
import { apiErrorSchema } from "#/lib/api/contracts";
import { getErrorMessage } from "#/lib/error-message";

interface WorkspaceFileUploadJob {
	workspaceId: string;
	parentId: string | null;
	file: File;
	clientMutationId: string;
	onProgress: (loadedBytes: number) => void;
	signal: AbortSignal;
}

interface WorkspaceFileUploadBatchInput {
	workspaceId: string;
	parentId: string | null;
	files: readonly File[];
	onSuccess: (command: WorkspaceCommandResult<WorkspaceItemSummary>) => void;
}

interface WorkspaceFileUploadBatchResult {
	successCount: number;
	errorCount: number;
	skippedCount: number;
}

const uploadRequestTimeoutMs = 5 * 60_000;

export async function runWorkspaceFileUploadBatch(
	input: WorkspaceFileUploadBatchInput,
): Promise<WorkspaceFileUploadBatchResult> {
	const { accepted, rejected } = partitionWorkspaceUploadSelection(input.files);

	for (const rejection of rejected) {
		toast.error(`${rejection.file.name}: ${rejection.message}`);
	}

	if (accepted.length === 0) {
		return {
			successCount: 0,
			errorCount: 0,
			skippedCount: rejected.length,
		};
	}

	const controller = new AbortController();
	const totalBytes = accepted.reduce((total, file) => total + file.size, 0);
	const loadedBytesByFile = new Map(accepted.map((file) => [file, 0]));
	const toastId = toast.loading(getUploadBatchStageMessage("uploading", accepted), {
		action: {
			label: "Cancel",
			onClick: () => controller.abort(new DOMException("Upload canceled.", "AbortError")),
		},
		description: getUploadProgressDescription(0, totalBytes),
		duration: Number.POSITIVE_INFINITY,
	});
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
			getUploadBatchStageMessage(percent === 100 ? "finalizing" : "uploading", accepted),
			{
				action: {
					label: "Cancel",
					onClick: () => controller.abort(new DOMException("Upload canceled.", "AbortError")),
				},
				description: getUploadProgressDescription(loadedTotal, totalBytes),
				duration: Number.POSITIVE_INFINITY,
				id: toastId,
			},
		);
	};

	try {
		const result = await uploadAcceptedFiles({
			files: accepted,
			onProgress,
			onSuccess: input.onSuccess,
			parentId: input.parentId,
			signal: controller.signal,
			workspaceId: input.workspaceId,
		});

		toast.success(getUploadBatchSuccessMessage(result, accepted.length), {
			action: undefined,
			description: undefined,
			duration: 3_000,
			id: toastId,
		});

		return {
			...result,
			skippedCount: rejected.length,
		};
	} catch (error) {
		toast.error(getUploadBatchErrorMessage(error, controller.signal), {
			action: undefined,
			description: undefined,
			duration: 5_000,
			id: toastId,
		});
		throw error;
	}
}

async function postWorkspaceFileUpload(
	job: WorkspaceFileUploadJob,
): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
	const uploadResponse = await postWorkspaceDirectUpload(job);

	if (!uploadResponse.ok) {
		throw new Error(await getWorkspaceFileUploadErrorMessage(uploadResponse));
	}

	return (await uploadResponse.json()) as WorkspaceCommandResult<WorkspaceItemSummary>;
}

async function postWorkspaceDirectUpload(job: WorkspaceFileUploadJob) {
	const endpoint = `/api/v1/workspaces/${job.workspaceId}/file-upload`;
	const contentType = job.file.type || "application/octet-stream";
	const session = await requestUploadJson<WorkspaceDirectUploadSession>(
		`${endpoint}?action=initiate`,
		{
			body: JSON.stringify({
				clientMutationId: job.clientMutationId,
				contentType,
				fileName: job.file.name,
				fileSize: job.file.size,
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

	const completeInput: CompleteWorkspaceDirectUploadInput = {
		completionToken: session.completionToken,
	};
	return fetch(`${endpoint}?action=complete`, {
		body: JSON.stringify(completeInput),
		headers: { "content-type": "application/json" },
		method: "POST",
		signal: getUploadRequestSignal(job.signal),
	});
}

async function requestUploadJson<T>(url: string, init: RequestInit): Promise<T> {
	const response = await fetch(url, init);

	if (!response.ok) {
		throw new Error(await getWorkspaceFileUploadErrorMessage(response));
	}

	return (await response.json()) as T;
}

function toUploadJob(input: {
	workspaceId: string;
	parentId: string | null;
	file: File;
	clientMutationId?: string;
	onProgress: (loadedBytes: number) => void;
	signal: AbortSignal;
}): WorkspaceFileUploadJob {
	return {
		...prepareWorkspaceClientMutationInput(input),
		onProgress: input.onProgress,
		signal: input.signal,
	};
}

function uploadAcceptedFiles(input: {
	workspaceId: string;
	parentId: string | null;
	files: readonly File[];
	onProgress: (file: File, loadedBytes: number) => void;
	onSuccess: (command: WorkspaceCommandResult<WorkspaceItemSummary>) => void;
	signal: AbortSignal;
}): Promise<Pick<WorkspaceFileUploadBatchResult, "successCount" | "errorCount">> {
	const jobs = input.files.map((file) =>
		toUploadJob({
			file,
			onProgress: (loadedBytes) => input.onProgress(file, loadedBytes),
			parentId: input.parentId,
			signal: input.signal,
			workspaceId: input.workspaceId,
		}),
	);
	const total = jobs.length;

	return new Promise((resolve, reject) => {
		new AsyncQueuer<WorkspaceFileUploadJob>(postWorkspaceFileUpload, {
			concurrency: workspaceFileUploadLimits.concurrency,
			throwOnError: false,
			initialItems: jobs,
			onSuccess: (command) => {
				input.onSuccess(command);
			},
			onSettled: (_item, queuer) => {
				if (queuer.store.state.settledCount < total) {
					return;
				}

				const { successCount, errorCount } = queuer.store.state;

				if (successCount === 0) {
					if (input.signal.aborted) {
						reject(getWorkspaceUploadAbortReason(input.signal));
						return;
					}
					reject(
						new Error(
							total === 1
								? `Failed to upload ${input.files[0]?.name ?? "file"}.`
								: `Failed to upload ${total} files.`,
						),
					);
					return;
				}

				resolve({ successCount, errorCount });
			},
		});
	});
}

async function getWorkspaceFileUploadErrorMessage(response: Response) {
	const fallback = "Unable to upload file to workspace storage.";

	try {
		const payload = apiErrorSchema.safeParse(await response.json());

		return payload.success ? payload.data.message : fallback;
	} catch {
		return fallback;
	}
}

function getUploadBatchStageMessage(stage: "finalizing" | "uploading", files: readonly File[]) {
	const action = stage === "finalizing" ? "Finalizing" : "Uploading";
	if (files.length === 1) {
		return `${action} ${files[0]?.name ?? "file"}...`;
	}

	return `${action} ${files.length} files...`;
}

function getUploadProgressDescription(loadedBytes: number, totalBytes: number) {
	const percent = Math.floor((loadedBytes / totalBytes) * 100);
	return `${percent}% · ${formatBytes(loadedBytes)} of ${formatBytes(totalBytes)}`;
}

function formatBytes(bytes: number) {
	const megabytes = bytes / (1024 * 1024);
	return `${megabytes >= 10 ? megabytes.toFixed(0) : megabytes.toFixed(1)} MB`;
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

function getUploadRequestSignal(signal: AbortSignal) {
	return AbortSignal.any([signal, AbortSignal.timeout(uploadRequestTimeoutMs)]);
}

function getUploadBatchSuccessMessage(
	result: Pick<WorkspaceFileUploadBatchResult, "successCount" | "errorCount">,
	total: number,
) {
	if (total === 1) {
		return "Uploaded 1 file.";
	}

	if (result.errorCount === 0) {
		return `Uploaded ${result.successCount} files.`;
	}

	return `Uploaded ${result.successCount} of ${total} files.`;
}
