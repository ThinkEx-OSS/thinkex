import { z } from "zod";
import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { createDbContext } from "#/db/server";
import { workspaceRecordingMaxBytes } from "#/features/workspaces/recordings/workspace-recording";
import { getWorkspaceRecordingObjectPrefix } from "#/features/workspaces/recordings/workspace-recording-object-keys";
import {
	readWorkspaceRecordingAudio,
	saveWorkspaceRecordingAudio,
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

async function handleAudio(request: Request, workspaceId: string, itemId: string) {
	const requestId = getRequestId(request);
	const session = await getSessionFromRequest(request);
	if (!session) return apiError(requestId, 401, "UNAUTHORIZED", "You must be signed in.");
	try {
		const dbContext = await createDbContext();
		try {
			const authorize =
				request.method === "GET" ? assertCanReadWorkspace : assertCanMutateWorkspace;
			await authorize(dbContext.db, { workspaceId, userId: session.user.id });
		} finally {
			await dbContext.dispose();
		}
		const recording = await readWorkspaceRecordingAudio({ itemId, workspaceId });
		if (request.method === "PUT") {
			const uploadId = z.uuid().safeParse(request.headers.get("x-recording-upload-id"));
			const sizeBytes = Number(request.headers.get("x-recording-size-bytes"));
			const durationMs = Number(request.headers.get("x-recording-duration-ms"));
			const mimeType = request.headers.get("content-type") ?? "";
			if (
				!request.body ||
				!uploadId.success ||
				!Number.isInteger(sizeBytes) ||
				sizeBytes < 1 ||
				sizeBytes > workspaceRecordingMaxBytes ||
				!Number.isInteger(durationMs) ||
				durationMs < 1 ||
				durationMs > 2_147_483_647 ||
				mimeType !== recording.mimeType
			) {
				return apiError(
					requestId,
					400,
					"INVALID_RECORDING",
					"Recording audio is invalid or exceeds the 96 MiB limit.",
				);
			}
			const uploadPrefix = `${getWorkspaceRecordingObjectPrefix({ itemId, workspaceId })}${uploadId.data}/`;
			if (recording.objectKey) {
				return recording.objectKey.startsWith(uploadPrefix)
					? apiJson({ saved: true }, requestId)
					: apiError(
							requestId,
							409,
							"INVALID_RECORDING",
							"This item already contains another recording. Download your audio to keep it.",
						);
			}
			// Unique keys prevent concurrent requests from overwriting the winning audio.
			const objectKey = `${uploadPrefix}${crypto.randomUUID()}`;
			await putFixedLengthR2Object(
				env.WORKSPACE_FILES,
				objectKey,
				{ body: request.body, sizeBytes },
				{ httpMetadata: { contentType: mimeType } },
			);
			const saved = await saveWorkspaceRecordingAudio({
				itemId,
				workspaceId,
				objectKey,
				sizeBytes,
				durationMs,
				mimeType,
			});
			if (saved.objectKey !== objectKey) await env.WORKSPACE_FILES.delete(objectKey);
			if (!saved.objectKey?.startsWith(uploadPrefix))
				return apiError(
					requestId,
					409,
					"INVALID_RECORDING",
					"This item already contains another recording. Download your audio to keep it.",
				);
			return apiJson({ saved: true }, requestId, 201);
		}
		if (!recording.objectKey)
			return apiError(requestId, 404, "AUDIO_NOT_FOUND", "Audio has not been uploaded.");
		const object = await env.WORKSPACE_FILES.get(recording.objectKey, { range: request.headers });
		if (!object) return apiError(requestId, 404, "AUDIO_NOT_FOUND", "Audio not found.");
		const range = object.range;
		const suffix =
			range && "suffix" in range && typeof range.suffix === "number" ? range.suffix : null;
		const offset =
			suffix === null
				? range && "offset" in range && typeof range.offset === "number"
					? range.offset
					: 0
				: object.size - suffix;
		const length =
			suffix ??
			(range && "length" in range && typeof range.length === "number"
				? range.length
				: object.size - offset);
		const headers = new Headers({
			"accept-ranges": "bytes",
			"cache-control": "no-store",
			"content-length": String(length),
			"content-type": recording.mimeType,
			etag: object.httpEtag,
		});
		if (range)
			headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
		return new Response(object.body, {
			headers,
			status: range ? 206 : 200,
		});
	} catch (error) {
		if (error instanceof WorkspaceForbiddenError)
			return apiError(requestId, 403, "FORBIDDEN", "You cannot access this recording.");
		if (error instanceof WorkspaceRecordingError)
			return apiError(requestId, error.statusCode, error.code, error.message);
		throw error;
	}
}

export const Route = createFileRoute("/api/v1/workspaces/$workspaceId/recordings/$itemId/audio")({
	server: {
		handlers: {
			GET: ({ params, request }) => handleAudio(request, params.workspaceId, params.itemId),
			PUT: ({ params, request }) => handleAudio(request, params.workspaceId, params.itemId),
		},
	},
});
