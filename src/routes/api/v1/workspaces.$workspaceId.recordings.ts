import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createWorkspaceRecording } from "#/features/workspaces/recordings/workspace-recording-persistence";
import { createDbContext } from "#/db/server";
import {
	assertCanMutateWorkspace,
	WorkspaceForbiddenError,
} from "#/features/workspaces/server/permissions";
import { apiError, apiJson, getRequestId } from "#/lib/api/http";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

const createRecordingSchema = z.object({
	mimeType: z.string().trim().startsWith("audio/").max(100),
	name: z.string().trim().min(1).max(160),
	parentId: z.string().min(1).nullable(),
});

async function handleCreateRecording(request: Request, workspaceId: string) {
	const requestId = getRequestId(request);
	const session = await getSessionFromRequest(request);
	if (!session) return apiError(requestId, 401, "UNAUTHORIZED", "You must be signed in.");
	const value: unknown = await request.json().catch(() => null);
	const parsed = createRecordingSchema.safeParse(value);
	if (!parsed.success) {
		return apiError(requestId, 400, "INVALID_RECORDING", "Recording details are invalid.");
	}
	const dbContext = await createDbContext();
	try {
		await assertCanMutateWorkspace(dbContext.db, { workspaceId, userId: session.user.id });
		const recording = await createWorkspaceRecording(env, {
			itemId: crypto.randomUUID(),
			workspaceId,
			ownerId: session.user.id,
			parentId: parsed.data.parentId,
			name: parsed.data.name,
			mimeType: parsed.data.mimeType,
		});
		return apiJson(recording, requestId, 201);
	} catch (error) {
		if (error instanceof WorkspaceForbiddenError) {
			return apiError(requestId, 403, "FORBIDDEN", "You cannot edit this workspace.");
		}
		throw error;
	} finally {
		await dbContext.dispose();
	}
}

export const Route = createFileRoute("/api/v1/workspaces/$workspaceId/recordings")({
	server: {
		handlers: {
			POST: ({ params, request }) => handleCreateRecording(request, params.workspaceId),
		},
	},
});
