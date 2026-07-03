import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpHandler } from "agents/mcp";

import { isMcpRequestPath } from "#/features/workspaces/agent-routes";
import { type McpActor, McpAuthError, verifyMcpBearerToken } from "./mcp-auth";

function buildMcpServer(): McpServer {
	const server = new McpServer({ name: "thinkex", version: "1.0.0" });
	// Tool registrations added in Subproblem 4
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
			return Response.json({ error: error.code }, { status: error.status });
		}
		throw error;
	}

	const handler = createMcpHandler(buildMcpServer(), {
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
