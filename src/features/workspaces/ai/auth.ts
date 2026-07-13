import { getAgentByName } from "agents";

import { isUserAIRequestPath, userAIAgentName } from "#/features/workspaces/agent-routes";
import {
	logOperationalEvent,
	recordOperationalFailure,
} from "#/integrations/observability/operational-events";
import {
	getTelemetryRequestContext,
	getTelemetryRequestDetails,
} from "#/integrations/posthog/server-context";
import { getSessionFromRequest } from "#/lib/auth-queries.server";

export async function routeUserAIRequest(request: Request, env: Env) {
	const url = new URL(request.url);

	if (!isUserAIRequestPath(url.pathname)) {
		return null;
	}
	const requestDetails = getTelemetryRequestDetails(request, "user_ai_route");

	try {
		const session = await getSessionFromRequest(request);

		if (!session?.user) {
			return new Response("Unauthorized", { status: 401 });
		}

		const requestContext = getTelemetryRequestContext(requestDetails);
		const directory = await getAgentByName(env[userAIAgentName], session.user.id, {
			routingRetry: {
				onRetry: ({ attempt, className, delayMs, error, maxAttempts }) => {
					logOperationalEvent({
						error,
						event: "user_ai_route_retry",
						fields: {
							attempt,
							durable_object_class: className ?? userAIAgentName,
							max_attempts: maxAttempts,
							retry_delay_ms: delayMs,
						},
						outcome: "partial",
						requestContext,
					});
				},
			},
		});

		return directory.fetch(request);
	} catch (error) {
		recordOperationalFailure({
			error,
			event: "user_ai_route",
			fields: { status_code: 503 },
			request: requestDetails,
		});
		return new Response("User AI unavailable", { status: 503 });
	}
}
