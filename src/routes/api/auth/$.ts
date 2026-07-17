import { createFileRoute } from "@tanstack/react-router";
import { isMcpOAuthPath, mcpCorsPreflightResponse, withMcpCors } from "#/features/mcp/mcp-cors";
import { withAuth } from "#/lib/auth.server";

async function handleAuthRequest(request: Request) {
	const response = await withAuth((auth) => auth.handler(request));
	return isMcpOAuthPath(new URL(request.url).pathname) ? withMcpCors(response) : response;
}

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: ({ request }) => handleAuthRequest(request),
			OPTIONS: ({ request }) =>
				isMcpOAuthPath(new URL(request.url).pathname)
					? mcpCorsPreflightResponse()
					: new Response(null, { status: 404 }),
			POST: ({ request }) => handleAuthRequest(request),
		},
	},
});
