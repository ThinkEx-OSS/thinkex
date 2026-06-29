import { createDbContext } from "#/db/server";
import {
	getDocumentSessionRoomName,
	getDocumentSessionRouteParams,
	isDocumentSessionRequestPath,
} from "#/features/workspaces/agent-routes";
import { canReadWorkspace, WorkspaceAuthError } from "#/features/workspaces/server/permissions";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

export async function routeDocumentSessionRequest(request: Request, env: Env) {
	const url = new URL(request.url);

	if (!isDocumentSessionRequestPath(url.pathname)) {
		return null;
	}

	const params = getDocumentSessionRouteParams(url.pathname);

	if (!params) {
		return new Response("Document session not found", { status: 404 });
	}

	try {
		const session = await getSessionFromRequest(request);

		if (!session?.user) {
			return new Response("Unauthorized", { status: 401 });
		}

		const dbContext = await createDbContext();

		try {
			const canRead = await canReadWorkspace(dbContext.db, {
				workspaceId: params.workspaceId,
				userId: session.user.id,
			});

			if (!canRead) {
				return new Response("Forbidden", { status: 403 });
			}

			const documentSession = env.DocumentSession.getByName(getDocumentSessionRoomName(params));

			return documentSession.fetch(request);
		} finally {
			await dbContext.dispose();
		}
	} catch (error) {
		if (error instanceof WorkspaceAuthError) {
			return new Response("Unauthorized", { status: 401 });
		}

		console.error("Document session auth failed", error);
		return new Response("Document session unavailable", { status: 503 });
	}
}
