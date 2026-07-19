import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { openApiMcpServer } from "@cloudflare/codemode/mcp";
import {
	oauthProviderAuthServerMetadata,
	oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { createMcpHandler } from "agents/mcp";

import { instrumentMcpAnalytics } from "#/features/mcp/mcp-analytics";
import { authenticateMcpRequest } from "#/features/mcp/mcp-auth";
import {
	getMcpUrls,
	mcpAuthPath,
	mcpHandlerOptions,
	mcpOperationPathPrefix,
	mcpPath,
	mcpScopes,
} from "#/features/mcp/mcp-config";
import { executeMcpOperation, type McpPrincipal } from "#/features/mcp/mcp-operation-catalog";
import { mcpCorsPreflightResponse, withMcpCors } from "#/features/mcp/mcp-cors";
import { mcpOpenApiSpec } from "#/features/mcp/mcp-openapi";
import { getAppOrigin } from "#/lib/app-origin";
import { withAuth } from "#/lib/auth.server";

const protectedResourceMetadataPaths = new Set([
	"/.well-known/oauth-protected-resource",
	`/.well-known/oauth-protected-resource${mcpPath}`,
]);
const authorizationServerMetadataPaths = new Set([
	"/.well-known/oauth-authorization-server",
	`/.well-known/oauth-authorization-server${mcpAuthPath}`,
]);
const openIdMetadataPaths = new Set([
	"/.well-known/openid-configuration",
	`${mcpAuthPath}/.well-known/openid-configuration`,
]);

function getPrincipal(payload: { scope?: unknown; sub?: string }): McpPrincipal {
	if (!payload.sub) {
		throw new Error("OAuth access token is missing its subject.");
	}

	return {
		scopes: new Set(
			typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [],
		),
		userId: payload.sub,
	};
}

function createThinkExMcpServer(env: Cloudflare.Env, principal: McpPrincipal) {
	const server = openApiMcpServer({
		name: "ThinkEx",
		version: "1.0.0",
		description:
			"Search and execute operations across the authenticated user's ThinkEx workspaces.",
		spec: mcpOpenApiSpec,
		executor: new DynamicWorkerExecutor({
			loader: env.LOADER,
			globalOutbound: null,
		}),
		request: async (options, context) => {
			if (options.method !== "POST" || !options.path.startsWith(mcpOperationPathPrefix)) {
				throw new Error("Unsupported MCP operation request.");
			}

			const operationName = options.path.slice(mcpOperationPathPrefix.length);

			return await executeMcpOperation({
				name: operationName,
				body: options.body,
				operationId: `mcp:${String(context.requestId)}:${crypto.randomUUID()}`,
				principal,
			});
		},
	});

	instrumentMcpAnalytics(server, principal.userId);

	return server;
}

function protectedResourceMetadata() {
	const origin = getAppOrigin();
	const { issuer, resource } = getMcpUrls(origin);

	return Response.json({
		resource,
		resource_name: "ThinkEx",
		resource_documentation: `${origin}/`,
		resource_policy_uri: `${origin}/privacy`,
		resource_tos_uri: `${origin}/terms`,
		authorization_servers: [issuer],
		bearer_methods_supported: ["header"],
		scopes_supported: mcpScopes,
	});
}

async function handleAuthenticatedMcpRequest(
	request: Request,
	env: Cloudflare.Env,
	ctx: ExecutionContext,
) {
	const { issuer, resource } = getMcpUrls(getAppOrigin());

	return await authenticateMcpRequest({
		getJwks: () => withAuth((auth) => auth.api.getJwks()),
		handle: async (authenticatedRequest, payload) => {
			const server = createThinkExMcpServer(env, getPrincipal(payload));
			return await createMcpHandler(server, mcpHandlerOptions)(authenticatedRequest, env, ctx);
		},
		issuer,
		request,
		resource,
	});
}

function isMcpProtocolPath(pathname: string) {
	return (
		pathname === mcpPath ||
		protectedResourceMetadataPaths.has(pathname) ||
		authorizationServerMetadataPaths.has(pathname) ||
		openIdMetadataPaths.has(pathname)
	);
}

export async function routeMcpRequest(
	request: Request,
	env: Cloudflare.Env,
	ctx: ExecutionContext,
): Promise<Response | null> {
	const pathname = new URL(request.url).pathname;

	if (request.method === "OPTIONS" && isMcpProtocolPath(pathname)) {
		return mcpCorsPreflightResponse();
	}

	if (protectedResourceMetadataPaths.has(pathname)) {
		return withMcpCors(protectedResourceMetadata());
	}

	if (authorizationServerMetadataPaths.has(pathname)) {
		return await withAuth(async (auth) => {
			return withMcpCors(await oauthProviderAuthServerMetadata(auth)(request));
		});
	}

	if (openIdMetadataPaths.has(pathname)) {
		return await withAuth(async (auth) => {
			return withMcpCors(await oauthProviderOpenIdConfigMetadata(auth)(request));
		});
	}

	if (pathname !== mcpPath) {
		return null;
	}

	return withMcpCors(await handleAuthenticatedMcpRequest(request, env, ctx));
}
