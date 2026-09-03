import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createDbContext } from "#/db/server";
import {
	finalizeWorkspaceRecording,
	readWorkspaceRecording,
	WorkspaceRecordingError,
} from "#/features/workspaces/recordings/workspace-recording-persistence";
import {
	assertCanMutateWorkspace,
	assertCanReadWorkspace,
	WorkspaceForbiddenError,
} from "#/features/workspaces/server/permissions";
import { sha256Base64UrlText } from "#/lib/binary";
import { apiError, apiJson, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

const finalizeRecordingSchema = z.object({
	expectedSegmentCount: z.number().int().positive().max(1_000),
});

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
	const value: unknown = await request.json().catch(() => null);
	const parsed = finalizeRecordingSchema.safeParse(value);
	if (!parsed.success) {
		return apiError(requestId, 400, "INVALID_RECORDING", "Recording finalization is invalid.");
	}
	try {
		const dbContext = await createDbContext();
		try {
			await assertCanMutateWorkspace(dbContext.db, { workspaceId, userId: session.user.id });
		} finally {
			await dbContext.dispose();
		}
		const workflowId = await getLectureTranscriptionWorkflowId(itemId);
		const recording = await finalizeWorkspaceRecording({
			itemId,
			workspaceId,
			userId: session.user.id,
			expectedSegmentCount: parsed.data.expectedSegmentCount,
			workflowId,
		});
		await ensureTranscriptionWorkflow(workflowId, itemId);
		return apiJson({ status: recording.status }, requestId, 202);
	} catch (error) {
		if (error instanceof WorkspaceForbiddenError) {
			return apiError(requestId, 403, "FORBIDDEN", "You cannot edit this workspace.");
		}
		return recordingErrorResponse(requestId, error);
	}
}

async function getLectureTranscriptionWorkflowId(itemId: string) {
	const digest = await sha256Base64UrlText(`lecture-recording:${itemId}:transcription:v1`);
	return `recording-${digest.slice(0, 48)}`;
}

async function ensureTranscriptionWorkflow(workflowId: string, itemId: string) {
	await env.LECTURE_TRANSCRIPTION_WORKFLOW.createBatch([{ id: workflowId, params: { itemId } }]);
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
