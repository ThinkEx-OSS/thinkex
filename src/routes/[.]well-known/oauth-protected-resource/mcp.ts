import { createFileRoute } from "@tanstack/react-router";

import { MCP_SUPPORTED_SCOPES } from "#/features/workspaces/mcp/mcp-scopes";
import { getAppOrigin, getMcpResourceUrl } from "#/lib/app-origin";

export const Route = createFileRoute("/.well-known/oauth-protected-resource/mcp")({
	server: {
		handlers: {
			GET: () => {
				const appOrigin = getAppOrigin();

				return Response.json(
					{
						resource: getMcpResourceUrl(appOrigin),
						authorization_servers: [appOrigin],
						scopes_supported: [...MCP_SUPPORTED_SCOPES],
						bearer_methods_supported: ["header"],
					},
					{
						headers: {
							"Access-Control-Allow-Origin": "*",
							"Cache-Control": "public, max-age=3600",
						},
					},
				);
			},
		},
	},
});
