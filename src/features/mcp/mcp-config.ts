import type { CreateMcpHandlerOptions } from "agents/mcp";

export const mcpPath = "/mcp";
export const mcpAuthPath = "/api/auth";
export const mcpOperationPathPrefix = "/operations/";

/**
 * ThinkEx creates a fresh server for each request. JSON responses let the MCP analytics
 * wrapper return a replayable session token after `initialize`, preserving session and
 * client attribution across those stateless server instances.
 */
export const mcpHandlerOptions = {
	route: mcpPath,
	enableJsonResponse: true,
} satisfies CreateMcpHandlerOptions;

export const mcpScopes = ["workspaces:read", "workspaces:write"] as const;
export type McpScope = (typeof mcpScopes)[number];

export const mcpScopeDescriptions: Record<McpScope, string> = {
	"workspaces:read": "View your workspaces and their contents.",
	"workspaces:write": "Create, edit, move, link, and delete workspace content.",
};

export const mcpOAuthScopes = ["openid", "offline_access", ...mcpScopes] as const;

export function getMcpResource(origin: string) {
	return `${origin}${mcpPath}`;
}

export function getMcpUrls(origin: string) {
	return {
		issuer: `${origin}${mcpAuthPath}`,
		resource: getMcpResource(origin),
	};
}
