import { getAgentByName } from "agents";

import { isUserAIRequestPath, userAIAgentName } from "#/features/workspaces/agent-routes";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";
import { getTelemetryRequestDetails } from "#/integrations/posthog/server-context";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

export async function routeUserAIRequest(request: Request, env: Env) {
	const url = new URL(request.url);

	if (!isUserAIRequestPath(url.pathname)) {
		return null;
	}

	try {
		const session = await getSessionFromRequest(request);

		if (!session?.user) {
			return new Response("Unauthorized", { status: 401 });
		}

		const directory = await getAgentByName(env[userAIAgentName], session.user.id);

		return directory.fetch(request);
	} catch (error) {
		recordOperationalFailure({
			error,
			event: "user_ai_route",
			fields: { status_code: 503 },
			request: getTelemetryRequestDetails(request, "user_ai_route"),
		});
		return new Response("User AI unavailable", { status: 503 });
	}
}
