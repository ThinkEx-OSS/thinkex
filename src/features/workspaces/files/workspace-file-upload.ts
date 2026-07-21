import { toast } from "sonner";

import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import { workspaceFileUploadLimits } from "#/features/workspaces/model/workspace-file";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";
import { uploadFileDirectlyToR2 } from "#/features/workspaces/upload/workspace-file-direct-upload-client";
import { partitionWorkspaceUploadSelection } from "#/features/workspaces/upload/workspace-upload-intake";
import {
	type CompleteWorkspaceDirectUploadInput,
	type WorkspaceDirectUploadSession,
} from "#/features/workspaces/upload/workspace-file-upload-protocol";
import { prepareWorkspaceClientMutationInput } from "#/features/workspaces/use-workspace-client-mutation-echo";
import { capturePostHogClientException } from "#/integrations/posthog/provider";
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

type WorkspaceFileUploadOutcome =
	| {
			command: WorkspaceCommandResult<WorkspaceItemSummary>;
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
		const reportableFailure = failures.find((failure) => !isWorkspaceUploadAbortError(failure));

		if (reportableFailure) {
			capturePostHogClientException(reportableFailure, {
				operation: "workspace_file_upload",
				upload_error_count: failures.length,
				upload_skipped_count: rejected.length,
				upload_success_count: successCount,
			});
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

async function uploadWorkspaceFile(
	job: WorkspaceFileUploadJob,
): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
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

	return requestUploadJson<WorkspaceCommandResult<WorkspaceItemSummary>>(
		`${endpoint}?action=complete`,
		{
			body: JSON.stringify({
				completionToken: session.completionToken,
			} satisfies CompleteWorkspaceDirectUploadInput),
			headers: { "content-type": "application/json" },
			method: "POST",
			signal: getUploadRequestSignal(job.signal),
		},
	);
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
		throw new Error(await getWorkspaceFileUploadErrorMessage(response));
	}

	return (await response.json()) as T;
}

async function uploadAcceptedFiles(input: {
	workspaceId: string;
	parentId: string | null;
	files: readonly File[];
	onProgress: (file: File, loadedBytes: number) => void;
	onSuccess: (command: WorkspaceCommandResult<WorkspaceItemSummary>) => void;
	signal: AbortSignal;
}): Promise<WorkspaceFileUploadOutcome[]> {
	const jobs = input.files.map((file) =>
		prepareWorkspaceClientMutationInput({
			file,
			onProgress: (loadedBytes: number) => input.onProgress(file, loadedBytes),
			parentId: input.parentId,
			signal: input.signal,
			workspaceId: input.workspaceId,
		}),
	);
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

async function getWorkspaceFileUploadErrorMessage(response: Response) {
	const fallback = "Unable to upload file to workspace storage.";

	try {
		const payload = apiErrorSchema.safeParse(await response.json());

		return payload.success ? payload.data.message : fallback;
	} catch {
		return fallback;
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
