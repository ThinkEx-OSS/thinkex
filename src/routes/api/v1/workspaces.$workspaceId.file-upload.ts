import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createDbContext } from "#/db/server";
import { fetchPublicImageForImport } from "#/features/workspaces/ai/web-fetch";
import { WorkspaceFileConversionError } from "#/features/workspaces/conversion/errors";
import { requestWorkspaceFileExtraction } from "#/features/workspaces/extraction/request-workspace-file-extraction";
import { checkWorkspaceFileUploadAccess } from "#/integrations/autumn/workspace-file-usage";
import {
	getWorkspaceFileItemObjectPrefix,
	getWorkspaceFilePreviewObjectKey,
	getWorkspaceFileSourceObjectKey,
	getWorkspaceFileUploadObjectKey,
} from "#/features/workspaces/files/workspace-file-object-keys";
import { requireAppliedWorkspaceMutation } from "#/features/workspaces/persistence/workspace-persistence-types";
import {
	WorkspaceFileUploadError,
	workspaceFileUploadLimits,
} from "#/features/workspaces/model/workspace-file";
import { createWorkspaceFileFromUpload } from "#/features/workspaces/persistence/workspace-files";
import { createWorkspaceItem } from "#/features/workspaces/persistence/workspace-items";
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
	resolveWorkspaceDirectUploadTarget,
	validateWorkspaceUpload,
	type WorkspaceUploadPlan,
} from "#/features/workspaces/upload/workspace-upload-intake";
import { apiError, apiJson, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";
import { deleteR2Prefix } from "#/lib/r2";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

const uploadIntentSchema = z.object({
	contentType: z.string().min(1),
	fileName: z.string().min(1),
	fileSize: z.number().int().positive(),
	// The document or card set this image rides inside. Owner-bound uploads
	// stay hidden from listings and skip the upload meter, so they are only
	// accepted for images — anything else could bypass billing.
	ownerItemId: z.string().min(1).nullable().optional(),
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

	if (action === "import-image") {
		return importWorkspaceImageFromUrl(request, workspaceId);
	}

	return apiError(getRequestId(request), 400, "INVALID_UPLOAD", "Unknown upload action.");
}

const importImageSchema = z.object({
	ownerItemId: z.string().min(1),
	url: z.string().min(1),
});

/**
 * Imports a public web image (pasted rich content, later AI image search) as
 * an owner-bound workspace image. The server downloads the bytes behind the
 * same SSRF policy as AI web fetches, stages them where a direct upload would
 * land, and reuses the exact completion path — conversion, preview,
 * item creation, extraction.
 */
async function importWorkspaceImageFromUrl(request: Request, workspaceId: string) {
	const requestId = getRequestId(request);
	return observeWorkspaceFileIntake({
		kind: "workspace_file",
		request,
		requestId,
		workspaceId,
		run: async (observation) => {
			const itemId = crypto.randomUUID();
			const fileObjectPrefix = getWorkspaceFileItemObjectPrefix({ itemId, workspaceId });
			let fileItemCreated = false;
			try {
				const userId = await authorizeWorkspaceUpload(request, workspaceId);
				observation.userId = userId;
				const input = await parseJsonRequest(request, importImageSchema);

				let fetched: Awaited<ReturnType<typeof fetchPublicImageForImport>>;
				try {
					fetched = await fetchPublicImageForImport({
						maxBytes: workspaceFileUploadLimits.maxImageFileBytes,
						url: input.url,
					});
				} catch (error) {
					throw new WorkspaceUploadRequestError(
						422,
						"IMPORT_FAILED",
						error instanceof Error ? error.message : "Unable to download this image.",
					);
				}

				const validation = validateWorkspaceUpload({
					contentType: fetched.mediaType,
					fileName: fetched.fileName,
					sizeBytes: fetched.bytes.byteLength,
				});
				if (
					!validation.ok ||
					validation.plan.kind !== "file" ||
					validation.plan.descriptor.assetKind !== "image"
				) {
					throw invalidUpload(
						validation.ok ? "This URL is not a supported image format." : validation.error.message,
					);
				}
				observation.inputBytes = fetched.bytes.byteLength;
				observation.plan = validation.plan.kind;

				const uploadedObjectKey = getWorkspaceFileUploadObjectKey({ itemId, workspaceId });
				await env.WORKSPACE_FILES.put(uploadedObjectKey, fetched.bytes, {
					httpMetadata: { contentType: fetched.mediaType },
				});
				const uploadedObject = await env.WORKSPACE_FILES.get(uploadedObjectKey);
				if (!uploadedObject) {
					throw new Error("Staged import object could not be read back.");
				}

				try {
					const upload = await finalizeWorkspaceFileUploadStorage({
						contentType: fetched.mediaType,
						descriptor: validation.plan.descriptor,
						env,
						finalObjectKey: getWorkspaceFileSourceObjectKey({ itemId, workspaceId }),
						fileName: fetched.fileName,
						fileSize: fetched.bytes.byteLength,
						previewObjectKey: getWorkspaceFilePreviewObjectKey({ itemId, workspaceId }),
						uploadedObject,
						uploadedObjectKey,
					});
					observation.assetKind = upload.descriptor.assetKind;
					observation.conversion = upload.source?.conversion;
					observation.outputBytes = upload.fileSize;

					const command = await createWorkspaceFileFromUpload(env, {
						assetKind: upload.descriptor.assetKind,
						contentType: upload.contentType,
						fileName: upload.fileName,
						fileSize: upload.fileSize,
						id: itemId,
						objectKey: upload.objectKey,
						ownerItemId: input.ownerItemId,
						parentId: null,
						preview: upload.preview,
						source: upload.source,
						actorUserId: userId,
						workspaceId,
					});
					fileItemCreated = true;
					observation.itemId = command.result.id;

					await requestWorkspaceFileExtraction({
						actorUserId: userId,
						assetKind: upload.descriptor.assetKind,
						itemId: command.result.id,
						ownerItemId: input.ownerItemId,
						requestId,
						workspaceId,
					});
					return apiJson(command, requestId);
				} finally {
					await deleteUploadObjectBestEffort({
						cleanup: "staging_upload",
						key: uploadedObjectKey,
						requestId,
						userId,
						workspaceId,
					});
				}
			} catch (error) {
				observation.error = error;
				return workspaceUploadErrorResponse(requestId, error);
			} finally {
				if (!fileItemCreated) {
					await deleteUploadObjectBestEffort({
						cleanup: "file_objects",
						key: fileObjectPrefix,
						prefix: true,
						requestId,
						userId: observation.userId,
						workspaceId,
					});
				}
			}
		},
	});
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

		const ownerItemId = input.ownerItemId ?? null;
		if (
			ownerItemId &&
			(validation.plan.kind !== "file" || validation.plan.descriptor.assetKind !== "image")
		) {
			return apiError(
				requestId,
				400,
				"INVALID_UPLOAD",
				"Only images can be uploaded into another item.",
			);
		}

		// Only uploads headed for extraction: that's the part that costs money and the
		// only path that decrements the meter. Gating local conversions would block
		// something free and never counted. Before the presigned URL, so nobody
		// uploads bytes we then reject. Owner-bound images are exempt: their
		// description pass costs a fraction of a cent, and metering a paste
		// mid-edit would read as the editor breaking.
		if (validation.plan.kind === "file" && !ownerItemId) {
			const access = await checkWorkspaceFileUploadAccess({ env, userId });

			if (!access.allowed) {
				return apiError(
					requestId,
					402,
					"upload_limit_reached",
					// Names what still works, because this is the only moment the user
					// finds out the cap isn't total — hitting it otherwise reads as the
					// whole product locking, which is what makes people leave rather
					// than upgrade.
					//
					// Gain-framed, and no raw date: the exact reset lives in settings, and a
					// server-formatted date has no idea what locale is reading it.
					"You've used all your file uploads this month — Markdown, CSV, and text files still import. Pro includes 500 a month.",
				);
			}
		}

		const session = await createWorkspaceDirectUploadSession(env, {
			...input,
			ownerItemId,
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
	let fileItemCreated = false;
	let fileObjectPrefix: string | null = null;
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
		const uploadedObject = await env.WORKSPACE_FILES.get(uploadedObjectKey);

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
			fileObjectPrefix = getWorkspaceFileItemObjectPrefix({
				itemId: claims.itemId,
				workspaceId,
			});
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

			command = await createWorkspaceFileFromUpload(env, {
				assetKind: upload.descriptor.assetKind,
				contentType: upload.contentType,
				fileName: upload.fileName,
				fileSize: upload.fileSize,
				id: claims.itemId,
				objectKey: upload.objectKey,
				ownerItemId: claims.ownerItemId,
				parentId: claims.parentId,
				preview: upload.preview,
				source: upload.source,
				actorUserId: userId,
				workspaceId,
			});
			fileItemCreated = true;

			observation.itemId = command.result.id;
			await requestWorkspaceFileExtraction({
				actorUserId: userId,
				assetKind: upload.descriptor.assetKind,
				itemId: command.result.id,
				ownerItemId: claims.ownerItemId,
				requestId,
				workspaceId,
			});
		}

		if (claims.target === "staging") {
			await deleteUploadObjectBestEffort({
				cleanup: "staging_upload",
				key: uploadedObjectKey,
				requestId,
				userId: observation.userId,
				workspaceId,
			});
		}
		uploadCompleted = true;

		return apiJson(command, requestId);
	} catch (error) {
		observation.error = error;
		return workspaceUploadErrorResponse(requestId, error);
	} finally {
		if (fileObjectPrefix && !fileItemCreated) {
			await deleteUploadObjectBestEffort({
				cleanup: "file_objects",
				key: fileObjectPrefix,
				prefix: true,
				requestId,
				userId: observation.userId,
				workspaceId,
			});
		}
		if (completionClaimKey && !uploadCompleted) {
			await deleteUploadObjectBestEffort({
				cleanup: "completion_claim",
				key: completionClaimKey,
				requestId,
				userId: observation.userId,
				workspaceId,
			});
		}
	}
}

async function deleteUploadObjectBestEffort(input: {
	cleanup: "completion_claim" | "file_objects" | "staging_upload";
	key: string;
	prefix?: boolean;
	requestId: string;
	userId?: string;
	workspaceId: string;
}) {
	try {
		if (input.prefix) {
			await deleteR2Prefix(env.WORKSPACE_FILES, input.key);
		} else {
			await env.WORKSPACE_FILES.delete(input.key);
		}
	} catch (error) {
		recordOperationalFailure({
			distinctId: input.userId,
			error,
			event: "workspace_file_upload_cleanup",
			fields: {
				cleanup: input.cleanup,
				request_id: input.requestId,
				workspace_id: input.workspaceId,
			},
		});
	}
}

async function createWorkspaceDocumentFromUpload(input: {
	claims: WorkspaceDirectUploadClaims;
	file: File;
	plan: Extract<WorkspaceUploadPlan, { kind: "document" }>;
}) {
	const documentContent = await input.plan.importer.importFile(input.file);

	return requireAppliedWorkspaceMutation(
		await createWorkspaceItem(env, {
			id: input.claims.itemId,
			actorUserId: input.claims.userId,
			initialContent: documentContent.initialContent,
			metadataJson: documentContent.metadataJson,
			name: documentContent.name,
			parentId: input.claims.parentId,
			type: "document",
			workspaceId: input.claims.workspaceId,
		}),
	);
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
		if (error.failure === "output_too_large") {
			return apiError(
				requestId,
				413,
				"SELECTION_TOO_LARGE",
				"This image is too detailed to upload after optimization.",
			);
		}
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
		this.name = "WorkspaceUploadRequestError";
	}
}

export const Route = createFileRoute("/api/v1/workspaces/$workspaceId/file-upload")({
	server: {
		handlers: {
			POST: ({ params, request }) => handleWorkspaceUploadPost(request, params.workspaceId),
		},
	},
});
