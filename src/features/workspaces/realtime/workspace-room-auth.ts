import { getAgentByName } from "agents";

import { createDbContext } from "#/db/server";
import {
	getWorkspaceRoomRouteWorkspaceId,
	isWorkspaceRoomRequestPath,
	workspaceRoomAgentName,
} from "#/features/workspaces/agent-routes";
import { setWorkspaceRoomUserHeaders } from "#/features/workspaces/realtime/workspace-room";
import { canReadWorkspace, WorkspaceAuthError } from "#/features/workspaces/server/permissions";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { getTelemetryRequestDetails } from "#/integrations/posthog/server-context";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

export async function routeWorkspaceRoomRequest(request: Request, env: Env) {
	const url = new URL(request.url);

	if (!isWorkspaceRoomRequestPath(url.pathname)) {
		return null;
	}

	const workspaceId = getWorkspaceRoomRouteWorkspaceId(url.pathname);

	if (!workspaceId) {
		return new Response("Workspace not found", { status: 404 });
	}

	try {
		const session = await getSessionFromRequest(request);

		if (!session?.user) {
			return new Response("Unauthorized", { status: 401 });
		}

		const dbContext = await createDbContext();
		let canRead: boolean;

		try {
			canRead = await canReadWorkspace(dbContext.db, {
				workspaceId,
				userId: session.user.id,
			});
		} finally {
			await dbContext.dispose();
		}

		if (!canRead) {
			return new Response("Forbidden", { status: 403 });
		}

		const user = {
			id: session.user.id,
			name: session.user.name,
			image: session.user.image ?? null,
		};
		const room = await getAgentByName(env[workspaceRoomAgentName], workspaceId);

		return room.fetch(setWorkspaceRoomUserHeaders(request, user));
	} catch (error) {
		if (error instanceof WorkspaceAuthError) {
			return new Response("Unauthorized", { status: 401 });
		}

		recordOperationalFailure({
			error,
			event: "workspace_room_route",
			fields: {
				status_code: 503,
				workspace_id: workspaceId,
			},
			request: getTelemetryRequestDetails(request, "workspace_room_route"),
		});
		return new Response("Workspace room unavailable", { status: 503 });
	}
}
