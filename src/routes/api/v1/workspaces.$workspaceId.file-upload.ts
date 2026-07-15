import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createDbContext } from "#/db/server";
import { WorkspaceFileConversionError } from "#/features/workspaces/conversion/errors";
import { requestWorkspaceFileExtraction } from "#/features/workspaces/extraction/request-workspace-file-extraction";
import {
	getWorkspaceFilePreviewObjectKey,
	getWorkspaceFileSourceObjectKey,
} from "#/features/workspaces/files/workspace-file-object-keys";
import {
	createWorkspaceFileFromUpload,
	getWorkspaceKernel,
} from "#/features/workspaces/kernel/workspace-kernel-access";
import {
	resolveWorkspaceFileAiReadStrategy,
	WorkspaceFileUploadError,
} from "#/features/workspaces/model/workspace-file";
import {
	assertCanMutateWorkspace,
	WorkspaceForbiddenError,
} from "#/features/workspaces/server/permissions";
import {
	claimWorkspaceDirectUploadCompletion,
	createWorkspaceDirectUploadSession,
	getWorkspaceDirectUploadObjectKey,
	verifyWorkspaceDirectUploadToken,
	type WorkspaceDirectUploadClaims,
} from "#/features/workspaces/upload/workspace-file-direct-upload";
import {
	observeWorkspaceFileIntake,
	type WorkspaceFileIntakeObservation,
} from "#/features/workspaces/upload/workspace-file-intake-observability";
import type { CompleteWorkspaceDirectUploadInput } from "#/features/workspaces/upload/workspace-file-upload-protocol";
import { finalizeWorkspaceFileUploadStorage } from "#/features/workspaces/upload/workspace-file-upload-storage";
import {
	createDocumentContentFromWorkspaceUpload,
	resolveWorkspaceDirectUploadTarget,
	validateWorkspaceUpload,
	type WorkspaceUploadPlan,
} from "#/features/workspaces/upload/workspace-upload-intake";
import { apiError, apiJson, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

const uploadIntentSchema = z.object({
	clientMutationId: z.string().min(1),
	contentType: z.string().min(1),
	fileName: z.string().min(1),
	fileSize: z.number().int().positive(),
	parentId: z.string().min(1).nullable(),
});
const uploadCompletionSchema = z.object({ completionToken: z.string().min(1) });

async function handleWorkspaceUploadPost(request: Request, workspaceId: string) {
	const action = new URL(request.url).searchParams.get("action");

	if (action === "initiate") {
		return initiateWorkspaceFileUpload(request, workspaceId);
	}

	if (action === "complete") {
		return completeWorkspaceFileUpload(request, workspaceId);
	}

	return apiError(getRequestId(request), 400, "INVALID_UPLOAD", "Unknown upload action.");
}

async function initiateWorkspaceFileUpload(request: Request, workspaceId: string) {
	const requestId = getRequestId(request);

	try {
		const userId = await authorizeWorkspaceUpload(request, workspaceId);
		const input = await readUploadIntent(request);
		const validation = validateWorkspaceUpload({
			contentType: input.contentType,
			fileName: input.fileName,
			sizeBytes: input.fileSize,
		});

		if (!validation.ok) {
			return apiError(
				requestId,
				validation.error.status,
				validation.error.code,
				validation.error.message,
			);
		}

		const session = await createWorkspaceDirectUploadSession(env, {
			...input,
			target: resolveWorkspaceDirectUploadTarget({
				contentType: input.contentType,
				fileName: input.fileName,
				plan: validation.plan,
			}),
			userId,
			workspaceId,
		});
		return apiJson(session, requestId, 201);
	} catch (error) {
		return workspaceUploadErrorResponse(requestId, error);
	}
}

async function completeWorkspaceFileUpload(request: Request, workspaceId: string) {
	const requestId = getRequestId(request);
	return observeWorkspaceFileIntake({
		kind: "workspace_file",
		request,
		requestId,
		run: (observation) => finalizeWorkspaceFileUpload(request, workspaceId, requestId, observation),
		workspaceId,
	});
}

async function finalizeWorkspaceFileUpload(
	request: Request,
	workspaceId: string,
	requestId: string,
	observation: WorkspaceFileIntakeObservation,
) {
	let completionClaimKey: string | null = null;
	let uploadCompleted = false;

	try {
		const userId = await authorizeWorkspaceUpload(request, workspaceId);
		observation.userId = userId;
		const claims = await readUploadClaims(request);

		if (claims.workspaceId !== workspaceId || claims.userId !== userId) {
			throw invalidUpload("Upload completion token does not belong to this workspace.");
		}

		const validation = validateWorkspaceUpload({
			contentType: claims.contentType,
			fileName: claims.fileName,
			sizeBytes: claims.fileSize,
		});

		if (!validation.ok) {
			throw invalidUpload("Upload completion metadata is invalid.");
		}
		const expectedTarget = resolveWorkspaceDirectUploadTarget({
			contentType: claims.contentType,
			fileName: claims.fileName,
			plan: validation.plan,
		});
		if (claims.target !== expectedTarget) {
			throw invalidUpload("Upload completion target is invalid.");
		}
		completionClaimKey = await claimWorkspaceDirectUploadCompletion(env, claims);
		if (!completionClaimKey) {
			throw invalidUpload("Upload is already being completed.");
		}
		observation.inputBytes = claims.fileSize;
		observation.plan = validation.plan.kind;

		const uploadedObjectKey = getWorkspaceDirectUploadObjectKey(claims);
		const uploadedObject = await env.WORKSPACE_KERNEL_FILES.get(uploadedObjectKey);

		if (!uploadedObject || uploadedObject.size !== claims.fileSize) {
			throw invalidUpload("Uploaded file size does not match the selected file.");
		}

		let command: Awaited<ReturnType<typeof createWorkspaceFileFromUpload>>;

		if (validation.plan.kind === "document") {
			command = await createWorkspaceDocumentFromUpload({
				claims,
				file: new File([await uploadedObject.arrayBuffer()], claims.fileName, {
					type: claims.contentType,
				}),
				plan: validation.plan,
			});
			observation.itemId = command.result.id;
			observation.outputBytes = claims.fileSize;
		} else {
			const finalObjectKey = getWorkspaceFileSourceObjectKey(claims);
			const upload = await finalizeWorkspaceFileUploadStorage({
				contentType: claims.contentType,
				descriptor: validation.plan.descriptor,
				env,
				finalObjectKey,
				fileName: claims.fileName,
				fileSize: claims.fileSize,
				previewObjectKey: getWorkspaceFilePreviewObjectKey(claims),
				uploadedObject,
				uploadedObjectKey,
			});
			observation.assetKind = upload.descriptor.assetKind;
			observation.conversion = upload.source?.conversion;
			observation.outputBytes = upload.fileSize;

			command = await createWorkspaceFileFromUpload({
				assetKind: upload.descriptor.assetKind,
				clientMutationId: claims.clientMutationId,
				contentType: upload.contentType,
				fileName: upload.fileName,
				fileSize: upload.fileSize,
				id: claims.itemId,
				objectKey: upload.objectKey,
				parentId: claims.parentId,
				preview: upload.preview,
				source: upload.source,
				userId,
				workspaceId,
			});

			observation.itemId = command.result.id;
			await queueWorkspaceFileExtraction(upload, {
				itemId: command.result.id,
				requestId,
				userId,
				workspaceId,
			});
		}

		if (claims.target === "staging") {
			await env.WORKSPACE_KERNEL_FILES.delete(uploadedObjectKey).catch(() => undefined);
		}
		uploadCompleted = true;

		return apiJson(command, requestId);
	} catch (error) {
		observation.error = error;
		return workspaceUploadErrorResponse(requestId, error);
	} finally {
		if (completionClaimKey && !uploadCompleted) {
			await env.WORKSPACE_KERNEL_FILES.delete(completionClaimKey).catch(() => undefined);
		}
	}
}

async function queueWorkspaceFileExtraction(
	upload: Awaited<ReturnType<typeof finalizeWorkspaceFileUploadStorage>>,
	input: { itemId: string; requestId: string; userId: string; workspaceId: string },
) {
	if (
		resolveWorkspaceFileAiReadStrategy({
			contentType: upload.contentType,
			descriptor: upload.descriptor,
			fileName: upload.fileName,
		}) !== "markdown_extraction"
	) {
		return;
	}

	await requestWorkspaceFileExtraction({
		actorUserId: input.userId,
		assetKind: upload.descriptor.assetKind,
		itemId: input.itemId,
		requestId: input.requestId,
		workspaceId: input.workspaceId,
	});
}

async function createWorkspaceDocumentFromUpload(input: {
	claims: WorkspaceDirectUploadClaims;
	file: File;
	plan: Extract<WorkspaceUploadPlan, { kind: "document" }>;
}) {
	const [documentContent, kernel] = await Promise.all([
		createDocumentContentFromWorkspaceUpload({
			file: input.file,
			plan: input.plan,
		}),
		getWorkspaceKernel(input.claims.workspaceId),
	]);

	return kernel.createItem({
		id: input.claims.itemId,
		actorUserId: input.claims.userId,
		clientMutationId: input.claims.clientMutationId,
		initialContent: documentContent.initialContent,
		metadataJson: documentContent.metadataJson,
		name: documentContent.name,
		parentId: input.claims.parentId,
		type: "document",
	});
}

async function authorizeWorkspaceUpload(request: Request, workspaceId: string) {
	const session = await getSessionFromRequest(request);

	if (!session) {
		throw new WorkspaceUploadRequestError(401, "UNAUTHORIZED", "You must be signed in.");
	}

	const dbContext = await createDbContext();

	try {
		await assertCanMutateWorkspace(dbContext.db, { userId: session.user.id, workspaceId });
	} finally {
		await dbContext.dispose();
	}

	return session.user.id;
}

async function readUploadIntent(request: Request) {
	return parseJsonRequest(request, uploadIntentSchema);
}

async function readUploadClaims(request: Request): Promise<WorkspaceDirectUploadClaims> {
	const input: CompleteWorkspaceDirectUploadInput = await parseJsonRequest(
		request,
		uploadCompletionSchema,
	);

	try {
		return await verifyWorkspaceDirectUploadToken(env, input.completionToken);
	} catch {
		throw invalidUpload("Upload completion token is invalid or expired.");
	}
}

async function parseJsonRequest<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
	const value: unknown = await request.json().catch(() => null);
	const result = schema.safeParse(value);

	if (!result.success) {
		throw invalidUpload("Upload request is invalid.");
	}

	return result.data;
}

function invalidUpload(message: string) {
	return new WorkspaceUploadRequestError(400, "INVALID_UPLOAD", message);
}

function workspaceUploadErrorResponse(requestId: string, error: unknown) {
	if (error instanceof WorkspaceUploadRequestError) {
		return apiError(requestId, error.status, error.code, error.message);
	}

	if (error instanceof WorkspaceForbiddenError) {
		return apiError(requestId, 403, "FORBIDDEN", "You cannot upload to this workspace.");
	}

	if (error instanceof WorkspaceFileUploadError) {
		return apiError(requestId, error.status, error.code, error.message);
	}

	if (error instanceof WorkspaceFileConversionError) {
		return apiError(requestId, 422, "CONVERSION_FAILED", error.userMessage);
	}

	return apiError(requestId, 500, "UPLOAD_FAILED", "Unable to upload file right now.");
}

class WorkspaceUploadRequestError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
	) {
		super(message);
	}
}

export const Route = createFileRoute("/api/v1/workspaces/$workspaceId/file-upload")({
	server: {
		handlers: {
			POST: ({ params, request }) => handleWorkspaceUploadPost(request, params.workspaceId),
		},
	},
});
