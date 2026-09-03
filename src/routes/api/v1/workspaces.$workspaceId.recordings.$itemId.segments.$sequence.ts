import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { createDbContext } from "#/db/server";
import { workspaceRecordingMaxSegmentBytes } from "#/features/workspaces/recordings/workspace-recording";
import { getWorkspaceRecordingSegmentObjectKey } from "#/features/workspaces/recordings/workspace-recording-object-keys";
import {
	readWorkspaceRecordingSegment,
	readWorkspaceRecordingSegmentForPlayback,
	recordWorkspaceRecordingSegment,
	WorkspaceRecordingError,
} from "#/features/workspaces/recordings/workspace-recording-persistence";
import {
	assertCanMutateWorkspace,
	assertCanReadWorkspace,
	WorkspaceForbiddenError,
} from "#/features/workspaces/server/permissions";
import { apiError, apiJson, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";
import { putFixedLengthR2Object } from "#/lib/r2";

async function handleSegment(
	request: Request,
	workspaceId: string,
	itemId: string,
	sequenceValue: string,
) {
	const requestId = getRequestId(request);
	const session = await getSessionFromRequest(request);
	if (!session) return apiError(requestId, 401, "UNAUTHORIZED", "You must be signed in.");
	const sequence = Number(sequenceValue);
	if (!Number.isInteger(sequence) || sequence < 0 || sequence >= 1_000) {
		return apiError(requestId, 400, "INVALID_RECORDING", "Recording segment is invalid.");
	}

	if (request.method === "GET") {
		try {
			const dbContext = await createDbContext();
			try {
				await assertCanReadWorkspace(dbContext.db, { workspaceId, userId: session.user.id });
			} finally {
				await dbContext.dispose();
			}
		} catch (error) {
			if (error instanceof WorkspaceForbiddenError) {
				return apiError(requestId, 403, "FORBIDDEN", "You cannot view this workspace.");
			}
			throw error;
		}
		const segment = await readSegmentForPlayback({ itemId, sequence, workspaceId });
		if (!segment) return apiError(requestId, 404, "SEGMENT_NOT_FOUND", "Audio segment not found.");
		const object = await env.WORKSPACE_FILES.get(segment.objectKey);
		if (!object) return apiError(requestId, 404, "SEGMENT_NOT_FOUND", "Audio segment not found.");
		return new Response(object.body, {
			headers: {
				"cache-control": "private, max-age=3600",
				"content-length": String(object.size),
				"content-type": segment.mimeType,
			},
		});
	}

	try {
		return await handleSegmentPut(
			request,
			{
				itemId,
				sequence,
				userId: session.user.id,
				workspaceId,
			},
			requestId,
		);
	} catch (error) {
		if (error instanceof WorkspaceForbiddenError) {
			return apiError(requestId, 403, "FORBIDDEN", "You cannot edit this workspace.");
		}
		if (error instanceof WorkspaceRecordingError) {
			return apiError(requestId, error.statusCode, error.code, error.message);
		}
		throw error;
	}
}

async function handleSegmentPut(
	request: Request,
	input: { itemId: string; sequence: number; userId: string; workspaceId: string },
	requestId: string,
) {
	const dbContext = await createDbContext();
	try {
		await assertCanMutateWorkspace(dbContext.db, {
			workspaceId: input.workspaceId,
			userId: input.userId,
		});
	} finally {
		await dbContext.dispose();
	}
	const sizeBytes = Number(request.headers.get("x-recording-size-bytes"));
	const durationMs = Number(request.headers.get("x-recording-duration-ms"));
	const mimeType = request.headers.get("content-type")?.trim() ?? "";
	if (
		!request.body ||
		!Number.isInteger(sizeBytes) ||
		sizeBytes < 1 ||
		sizeBytes > workspaceRecordingMaxSegmentBytes ||
		!Number.isInteger(durationMs) ||
		durationMs < 1 ||
		durationMs > 60_000 ||
		!mimeType.startsWith("audio/")
	) {
		return apiError(requestId, 400, "INVALID_RECORDING", "Recording segment is invalid.");
	}
	const existing = await readWorkspaceRecordingSegment({ ...input });
	if (existing) {
		if (
			existing.sizeBytes !== sizeBytes ||
			existing.durationMs !== durationMs ||
			existing.mimeType !== mimeType
		) {
			return apiError(
				requestId,
				409,
				"INVALID_RECORDING",
				"A different segment already uses this sequence number.",
			);
		}
		return apiJson({ sequence: existing.sequence }, requestId);
	}
	const objectKey = getWorkspaceRecordingSegmentObjectKey({
		itemId: input.itemId,
		sequence: input.sequence,
		workspaceId: input.workspaceId,
	});
	const object = await putFixedLengthR2Object(
		env.WORKSPACE_FILES,
		objectKey,
		{ body: request.body, sizeBytes },
		{ httpMetadata: { contentType: mimeType } },
	);
	const segment = await recordWorkspaceRecordingSegment({
		...input,
		objectKey,
		mimeType,
		sizeBytes,
		durationMs,
		etag: object.etag,
	});
	return apiJson({ sequence: segment.sequence }, requestId, 201);
}

async function readSegmentForPlayback(input: {
	itemId: string;
	sequence: number;
	workspaceId: string;
}) {
	return readWorkspaceRecordingSegmentForPlayback(input);
}

export const Route = createFileRoute(
	"/api/v1/workspaces/$workspaceId/recordings/$itemId/segments/$sequence",
)({
	server: {
		handlers: {
			GET: ({ params, request }) =>
				handleSegment(request, params.workspaceId, params.itemId, params.sequence),
			PUT: ({ params, request }) =>
				handleSegment(request, params.workspaceId, params.itemId, params.sequence),
		},
	},
});
