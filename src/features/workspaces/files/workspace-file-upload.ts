import { AsyncQueuer } from "@tanstack/pacer";
import { toast } from "sonner";

import type { WorkspaceItemSummary } from "#/features/workspaces/contracts";
import {
	resolveWorkspaceUploadConversion,
	workspaceFileUploadLimits,
} from "#/features/workspaces/model/workspace-file";
import type { WorkspaceCommandResult } from "#/features/workspaces/realtime/messages";
import {
	partitionWorkspaceUploadSelection,
	uploadPlanCreatesDocument,
} from "#/features/workspaces/upload/workspace-upload-intake";
import { prepareWorkspaceClientMutationInput } from "#/features/workspaces/use-workspace-client-mutation-echo";
import { apiErrorSchema } from "#/lib/api/contracts";
import { getErrorMessage } from "#/lib/error-message";

interface WorkspaceFileUploadJob {
	workspaceId: string;
	parentId: string | null;
	file: File;
	clientMutationId: string;
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

	const uploadPromise = uploadAcceptedFiles({
		files: accepted,
		onSuccess: input.onSuccess,
		parentId: input.parentId,
		workspaceId: input.workspaceId,
	});

	void toast.promise(uploadPromise, {
		loading: getUploadBatchLoadingMessage(accepted),
		success: (result) => getUploadBatchSuccessMessage(result, accepted.length),
		error: (error) => getErrorMessage(error, "Unable to upload files right now."),
	});

	const result = await uploadPromise;

	return {
		...result,
		skippedCount: rejected.length,
	};
}

async function postWorkspaceFileUpload(
	job: WorkspaceFileUploadJob,
): Promise<WorkspaceCommandResult<WorkspaceItemSummary>> {
	const formData = new FormData();

	formData.set("file", job.file);
	formData.set("clientMutationId", job.clientMutationId);

	if (job.parentId) {
		formData.set("parentId", job.parentId);
	}

	const uploadResponse = await fetch(`/api/v1/workspaces/${job.workspaceId}/file-upload`, {
		method: "POST",
		body: formData,
	});

	if (!uploadResponse.ok) {
		throw new Error(await getWorkspaceFileUploadErrorMessage(uploadResponse));
	}

	return (await uploadResponse.json()) as WorkspaceCommandResult<WorkspaceItemSummary>;
}

function toUploadJob(input: {
	workspaceId: string;
	parentId: string | null;
	file: File;
	clientMutationId?: string;
}): WorkspaceFileUploadJob {
	return prepareWorkspaceClientMutationInput(input);
}

function uploadAcceptedFiles(input: {
	workspaceId: string;
	parentId: string | null;
	files: readonly File[];
	onSuccess: (command: WorkspaceCommandResult<WorkspaceItemSummary>) => void;
}): Promise<Pick<WorkspaceFileUploadBatchResult, "successCount" | "errorCount">> {
	const jobs = input.files.map((file) =>
		toUploadJob({
			file,
			parentId: input.parentId,
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

function getUploadBatchLoadingMessage(files: readonly File[]) {
	if (
		files.some((file) =>
			uploadPlanCreatesDocument({
				fileName: file.name,
				contentType: file.type,
			}),
		)
	) {
		if (files.length === 1) {
			return `Converting ${files[0]?.name ?? "file"} to a document...`;
		}

		return `Converting and uploading ${files.length} files...`;
	}

	const firstConvertedFile = files.find((file) => getWorkspaceUploadConversion(file) !== null);

	if (firstConvertedFile) {
		if (files.length === 1) {
			const conversion = getWorkspaceUploadConversion(firstConvertedFile);
			return conversion === "office_to_pdf"
				? `Converting ${firstConvertedFile.name} to PDF...`
				: `Converting ${firstConvertedFile.name} to an image...`;
		}

		return `Converting and uploading ${files.length} files...`;
	}

	if (files.length === 1) {
		return `Uploading ${files[0]?.name ?? "file"}...`;
	}

	return `Uploading ${files.length} files...`;
}

function getWorkspaceUploadConversion(file: File) {
	return resolveWorkspaceUploadConversion({
		fileName: file.name,
		contentType: file.type,
	});
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
