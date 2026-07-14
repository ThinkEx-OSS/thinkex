import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { createDbContext } from "#/db/server";
import { WorkspaceFileConversionError } from "#/features/workspaces/conversion/errors";
import { requestWorkspaceFileExtraction } from "#/features/workspaces/extraction/request-workspace-file-extraction";
import {
	createWorkspaceFileFromUpload,
	getWorkspaceKernel,
} from "#/features/workspaces/kernel/workspace-kernel-access";
import {
	formatWorkspaceKernelByteLimit,
	WORKSPACE_KERNEL_MAX_IN_MEMORY_BYTES,
} from "#/features/workspaces/kernel/workspace-kernel-file-limits";
import {
	resolveWorkspaceFileAiReadStrategy,
	WorkspaceFileUploadError,
} from "#/features/workspaces/model/workspace-file";
import {
	assertCanMutateWorkspace,
	WorkspaceForbiddenError,
} from "#/features/workspaces/server/permissions";
import {
	createDocumentContentFromWorkspaceUpload,
	validateWorkspaceUpload,
	type WorkspaceUploadPlan,
} from "#/features/workspaces/upload/workspace-upload-intake";
import { prepareWorkspaceFileUpload } from "#/features/workspaces/upload/workspace-file-upload-normalization";
import {
	observeWorkspaceFileIntake,
	type WorkspaceFileIntakeObservation,
} from "#/features/workspaces/upload/workspace-file-intake-observability";
import { apiError, apiJson, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

const fileFormKey = "file";
const parentIdFormKey = "parentId";
const clientMutationIdFormKey = "clientMutationId";

async function handleWorkspaceFileUpload(request: Request, workspaceId: string) {
	const requestId = getRequestId(request);
	return observeWorkspaceFileIntake({
		kind: "workspace_file",
		request,
		requestId,
		run: (observation) => executeWorkspaceFileUpload(request, workspaceId, requestId, observation),
		workspaceId,
	});
}

async function executeWorkspaceFileUpload(
	request: Request,
	workspaceId: string,
	requestId: string,
	observation: WorkspaceFileIntakeObservation,
) {
	let objectKey: string | null = null;

	try {
		const session = await getSessionFromRequest(request);

		if (!session) {
			return apiError(
				requestId,
				401,
				"UNAUTHORIZED",
				"You must be signed in to upload workspace files.",
			);
		}
		observation.userId = session.user.id;

		const dbContext = await createDbContext();

		try {
			await assertCanMutateWorkspace(dbContext.db, {
				workspaceId,
				userId: session.user.id,
			});
		} finally {
			await dbContext.dispose();
		}

		const formData = await request.formData();
		const file = formData.get(fileFormKey);

		if (!(file instanceof File)) {
			return apiError(requestId, 400, "INVALID_UPLOAD", "File upload is missing a file.");
		}
		observation.inputBytes = file.size;

		const uploadValidation = validateWorkspaceUpload({
			fileName: file.name,
			sizeBytes: file.size,
			contentType: file.type,
		});

		if (!uploadValidation.ok) {
			return apiError(
				requestId,
				uploadValidation.error.status,
				uploadValidation.error.code,
				uploadValidation.error.message,
			);
		}

		const parentId = getNullableString(formData.get(parentIdFormKey));
		const clientMutationId = getNullableString(formData.get(clientMutationIdFormKey));
		const uploadPlan = uploadValidation.plan;
		observation.plan = uploadPlan.kind;

		if (uploadPlan.kind === "document") {
			const command = await createWorkspaceDocumentFromUpload({
				clientMutationId,
				file,
				parentId,
				plan: uploadPlan,
				userId: session.user.id,
				workspaceId,
			});

			observation.itemId = command.result.id;
			observation.outputBytes = file.size;
			return apiJson(command, requestId);
		}

		const upload = await prepareWorkspaceFileUpload({
			descriptor: uploadPlan.descriptor,
			env,
			file,
		});
		observation.assetKind = upload.descriptor.assetKind;
		observation.conversion = upload.source?.conversion;
		observation.outputBytes = upload.fileSize;

		// The WorkspaceKernel Durable Object materializes the whole file body in its
		// ~128MB isolate on ingest, so reject anything above the kernel's in-memory cap
		// before it can reset the object. Uses the post-conversion size the kernel buffers.
		if (upload.fileSize > WORKSPACE_KERNEL_MAX_IN_MEMORY_BYTES) {
			return apiError(
				requestId,
				413,
				"UPLOAD_TOO_LARGE",
				`This file is too large to process. Upload files up to ${formatWorkspaceKernelByteLimit(
					WORKSPACE_KERNEL_MAX_IN_MEMORY_BYTES,
				)}.`,
			);
		}

		objectKey = getWorkspaceFileUploadObjectKey(workspaceId);
		await env.WORKSPACE_KERNEL_FILES.put(objectKey, upload.body, {
			httpMetadata: {
				contentType: upload.contentType,
			},
		});

		const command = await createWorkspaceFileFromUpload({
			workspaceId,
			userId: session.user.id,
			parentId,
			fileName: upload.fileName,
			fileSize: upload.fileSize,
			objectKey,
			contentType: upload.contentType,
			assetKind: upload.descriptor.assetKind,
			source: upload.source,
			clientMutationId,
		});

		objectKey = null;
		observation.itemId = command.result.id;
		if (
			resolveWorkspaceFileAiReadStrategy({
				fileName: upload.fileName,
				contentType: upload.contentType,
				descriptor: upload.descriptor,
			}) === "markdown_extraction"
		) {
			await requestWorkspaceFileExtraction({
				workspaceId,
				itemId: command.result.id,
				actorUserId: session.user.id,
				assetKind: upload.descriptor.assetKind,
				requestId,
			});
		}

		return apiJson(command, requestId);
	} catch (error) {
		observation.error = error;
		if (error instanceof WorkspaceForbiddenError) {
			observation.error = undefined;
			return apiError(
				requestId,
				403,
				"FORBIDDEN",
				"You do not have permission to upload files to this workspace.",
			);
		}

		if (error instanceof WorkspaceFileUploadError) {
			observation.error = undefined;
			return apiError(requestId, error.status, error.code, error.message);
		}

		if (error instanceof WorkspaceFileConversionError) {
			return apiError(requestId, 422, "CONVERSION_FAILED", error.userMessage);
		}

		return apiError(requestId, 500, "UPLOAD_FAILED", "Unable to upload file right now.");
	} finally {
		if (objectKey) {
			await env.WORKSPACE_KERNEL_FILES.delete(objectKey);
		}
	}
}

export const Route = createFileRoute("/api/v1/workspaces/$workspaceId/file-upload")({
	server: {
		handlers: {
			POST: ({ params, request }) => handleWorkspaceFileUpload(request, params.workspaceId),
		},
	},
});

function getWorkspaceFileUploadObjectKey(workspaceId: string) {
	return `uploads/workspaces/${workspaceId}/${crypto.randomUUID()}/source`;
}

async function createWorkspaceDocumentFromUpload(input: {
	clientMutationId: string | null;
	file: File;
	parentId: string | null;
	plan: Extract<WorkspaceUploadPlan, { kind: "document" }>;
	userId: string;
	workspaceId: string;
}) {
	const documentContent = await createDocumentContentFromWorkspaceUpload({
		file: input.file,
		plan: input.plan,
	});
	const kernel = await getWorkspaceKernel(input.workspaceId);

	return kernel.createItem({
		parentId: input.parentId,
		type: "document",
		name: documentContent.name,
		metadataJson: documentContent.metadataJson,
		initialContent: documentContent.initialContent,
		actorUserId: input.userId,
		clientMutationId: input.clientMutationId,
	});
}

function getNullableString(value: FormDataEntryValue | null) {
	return typeof value === "string" && value.trim() ? value : null;
}

export { handleWorkspaceFileUpload };
