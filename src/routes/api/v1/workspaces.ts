import { createFileRoute } from "@tanstack/react-router";

import {
	accountAccessScopes,
	createAccountAccessContext,
} from "#/features/workspaces/operations/account-access-context";
import { listAccountWorkspacesOperation } from "#/features/workspaces/operations/list-workspaces";
import { apiError, apiFailure, apiJson, getRequestId } from "#/lib/api/http";
import { getAuthenticatedRequestUser } from "#/lib/auth-queries.server";

async function handleListWorkspaces(request: Request) {
	const requestId = getRequestId(request);

	try {
		const user = await getAuthenticatedRequestUser(request);

		if (!user) {
			return apiError(requestId, 401, "UNAUTHORIZED", "You must be signed in to view workspaces.");
		}

		const result = await listAccountWorkspacesOperation(
			createAccountAccessContext({
				scopes: accountAccessScopes,
				userId: user.id,
			}),
		);
		return apiJson(result, requestId);
	} catch (error) {
		return apiFailure({
			cause: error,
			code: "INTERNAL_ERROR",
			message: "Unable to load workspaces right now.",
			request,
			requestId,
			status: 500,
		});
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
