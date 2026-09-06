import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { createDbContext } from "#/db/server";
import {
	startWorkspaceRecordingTranscription,
	readWorkspaceRecording,
	WorkspaceRecordingError,
} from "#/features/workspaces/recordings/workspace-recording-persistence";
import {
	assertCanMutateWorkspace,
	assertCanReadWorkspace,
	WorkspaceForbiddenError,
} from "#/features/workspaces/server/permissions";
import { apiError, apiJson, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

async function handleGetRecording(request: Request, workspaceId: string, itemId: string) {
	const requestId = getRequestId(request);
	const session = await getSessionFromRequest(request);
	if (!session) return apiError(requestId, 401, "UNAUTHORIZED", "You must be signed in.");
	try {
		const dbContext = await createDbContext();
		try {
			await assertCanReadWorkspace(dbContext.db, { workspaceId, userId: session.user.id });
		} finally {
			await dbContext.dispose();
		}
		return apiJson(await readWorkspaceRecording({ itemId, workspaceId }), requestId);
	} catch (error) {
		if (error instanceof WorkspaceForbiddenError) {
			return apiError(requestId, 403, "FORBIDDEN", "You cannot view this workspace.");
		}
		return recordingErrorResponse(requestId, error);
	}
}

async function handleFinalizeRecording(request: Request, workspaceId: string, itemId: string) {
	const requestId = getRequestId(request);
	const session = await getSessionFromRequest(request);
	if (!session) return apiError(requestId, 401, "UNAUTHORIZED", "You must be signed in.");
	try {
		const dbContext = await createDbContext();
		try {
			await assertCanMutateWorkspace(dbContext.db, { workspaceId, userId: session.user.id });
		} finally {
			await dbContext.dispose();
		}
		const recording = await startWorkspaceRecordingTranscription({
			itemId,
			workspaceId,
		});
		if (recording.status !== "ready") {
			await env.RECORDING_TRANSCRIPTION_WORKFLOW.createBatch([
				{
					id: `recording-${itemId}-${recording.transcriptionAttempt}`,
					params: { itemId, attempt: recording.transcriptionAttempt },
				},
			]);
		}
		return apiJson({ status: recording.status }, requestId, 202);
	} catch (error) {
		if (error instanceof WorkspaceForbiddenError) {
			return apiError(requestId, 403, "FORBIDDEN", "You cannot edit this workspace.");
		}
		return recordingErrorResponse(requestId, error);
	}
}

function recordingErrorResponse(requestId: string, error: unknown) {
	if (error instanceof WorkspaceRecordingError) {
		return apiError(requestId, error.statusCode, error.code, error.message);
	}
	throw error;
}

export const Route = createFileRoute("/api/v1/workspaces/$workspaceId/recordings/$itemId")({
	server: {
		handlers: {
			GET: ({ params, request }) => handleGetRecording(request, params.workspaceId, params.itemId),
			POST: ({ params, request }) =>
				handleFinalizeRecording(request, params.workspaceId, params.itemId),
		},
	},
});
