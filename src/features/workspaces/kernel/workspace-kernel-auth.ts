import { getAgentByName } from "agents";

import { createDbContext } from "#/db/server";
import {
	getWorkspaceKernelRouteWorkspaceId,
	isWorkspaceKernelRequestPath,
	workspaceKernelAgentName,
} from "#/features/workspaces/agent-routes";
import { setWorkspaceKernelUserHeaders } from "#/features/workspaces/kernel/workspace-kernel";
import { canReadWorkspace, WorkspaceAuthError } from "#/features/workspaces/server/permissions";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

export async function routeWorkspaceKernelRequest(request: Request, env: Env) {
	const url = new URL(request.url);

	if (!isWorkspaceKernelRequestPath(url.pathname)) {
		return null;
	}

	const workspaceId = getWorkspaceKernelRouteWorkspaceId(url.pathname);

	if (!workspaceId) {
		return new Response("Workspace not found", { status: 404 });
	}

	try {
		const session = await getSessionFromRequest(request);

		if (!session?.user) {
			return new Response("Unauthorized", { status: 401 });
		}

		const dbContext = await createDbContext();

		try {
			const canRead = await canReadWorkspace(dbContext.db, {
				workspaceId,
				userId: session.user.id,
			});

			if (!canRead) {
				return new Response("Forbidden", { status: 403 });
			}

			const user = {
				id: session.user.id,
				name: session.user.name,
				image: session.user.image ?? null,
			};
			const kernel = await getAgentByName(env[workspaceKernelAgentName], workspaceId);

			return kernel.fetch(setWorkspaceKernelUserHeaders(request, user));
		} finally {
			await dbContext.dispose();
		}
	} catch (error) {
		if (error instanceof WorkspaceAuthError) {
			return new Response("Unauthorized", { status: 401 });
		}

		console.error("Workspace kernel auth failed", error);
		return new Response("Workspace kernel unavailable", { status: 503 });
	}
}
