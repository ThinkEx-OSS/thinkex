import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";

import { isMcpRequestPath } from "#/features/workspaces/agent-routes";
import { getMcpProtectedResourceMetadataUrl } from "#/lib/app-origin";
import { type McpActor, McpAuthError, verifyMcpBearerToken } from "./mcp-auth";
import { registerMcpTools } from "./mcp-tools";

function buildMcpWwwAuthenticateHeader(errorCode: string): string {
	const resourceMetadataUrl = getMcpProtectedResourceMetadataUrl();

	return `Bearer error="${errorCode}", resource_metadata="${resourceMetadataUrl}"`;
}

function buildMcpServer(actor: McpActor): McpServer {
	const server = new McpServer({ name: "thinkex", version: "1.0.0" });
	registerMcpTools(server, actor);
	return server;
}

export async function routeMcpRequest(
	request: Request,
	env: Env,
	ctx: ExecutionContext,
): Promise<Response | null> {
	const { pathname } = new URL(request.url);

	if (!isMcpRequestPath(pathname)) {
		return null;
	}

	let actor: McpActor;

	try {
		actor = await verifyMcpBearerToken(request);
	} catch (error) {
		if (error instanceof McpAuthError) {
			return Response.json(
				{ error: error.code },
				{
					status: error.status,
					headers: {
						"WWW-Authenticate": buildMcpWwwAuthenticateHeader(error.code),
					},
				},
			);
		}
		throw error;
	}

	const handler = createMcpHandler(buildMcpServer(actor), {
		authContext: {
			props: {
				userId: actor.userId,
				clientId: actor.clientId,
				scopes: [...actor.grantedScopes],
			},
		},
	});
	return handler(request, env, ctx);
}
