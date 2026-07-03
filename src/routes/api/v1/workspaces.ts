import { createFileRoute } from "@tanstack/react-router";

import {
	accountCapabilityScopes,
	createAccountCapabilityContext,
} from "#/features/workspaces/capabilities/account-capability-context";
import { listAccountCapabilityWorkspaces } from "#/features/workspaces/capabilities/list-workspaces";
import { apiError, apiJson, getRequestId } from "#/lib/api/http";
import { getAuthenticatedRequestUser } from "#/lib/auth-queries.server";

async function handleListWorkspaces(request: Request) {
	const requestId = getRequestId(request);

	try {
		const user = await getAuthenticatedRequestUser(request);

		if (!user) {
			return apiError(requestId, 401, "UNAUTHORIZED", "You must be signed in to view workspaces.");
		}

		const result = await listAccountCapabilityWorkspaces(
			createAccountCapabilityContext({
				scopes: accountCapabilityScopes,
				userId: user.id,
			}),
		);
		return apiJson(result, requestId);
	} catch (error) {
		return apiError(
			requestId,
			500,
			"INTERNAL_ERROR",
			"Unable to load workspaces right now.",
			error instanceof Error ? { message: error.message } : undefined,
		);
	}
}

export const Route = createFileRoute("/api/v1/workspaces")({
	server: {
		handlers: {
			GET: ({ request }) => handleListWorkspaces(request),
		},
	},
});

export { handleListWorkspaces };
