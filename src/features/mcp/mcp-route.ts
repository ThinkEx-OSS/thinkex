import { DynamicWorkerExecutor } from "@cloudflare/codemode";
import { openApiMcpServer } from "@cloudflare/codemode/mcp";
import {
	mcpHandler,
	oauthProviderAuthServerMetadata,
	oauthProviderOpenIdConfigMetadata,
} from "@better-auth/oauth-provider";
import { createMcpHandler } from "agents/mcp";

import {
	executeMcpOperation,
	getMcpOperation,
	mcpScopes,
	type McpPrincipal,
} from "#/features/mcp/mcp-operation-catalog";
import { mcpCorsPreflightResponse, withMcpCors } from "#/features/mcp/mcp-cors";
import { mcpOpenApiSpec } from "#/features/mcp/mcp-openapi";
import { getAppOrigin } from "#/lib/app-origin";
import { withAuth } from "#/lib/auth.server";

const mcpPath = "/mcp";
const operationPathPrefix = "/operations/";

function getOAuthUrls() {
	const origin = getAppOrigin();
	return {
		issuer: `${origin}/api/auth`,
		resource: `${origin}${mcpPath}`,
	};
}

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

async function confirmDelete(
	server: ReturnType<typeof openApiMcpServer>,
	requestId: string | number,
) {
	if (!server.server.getClientCapabilities()?.elicitation) {
		throw new Error("This MCP client must support elicitation before deleting workspace items.");
	}

	const result = await server.server.elicitInput(
		{
			mode: "form",
			message: "Confirm deletion of the requested ThinkEx workspace items.",
			requestedSchema: {
				type: "object",
				properties: {
					confirm: {
						type: "boolean",
						title: "Delete workspace items",
						description: "This action cannot be undone.",
					},
				},
				required: ["confirm"],
			},
		},
		{ relatedRequestId: requestId },
	);

	if (result.action !== "accept" || result.content?.confirm !== true) {
		throw new Error("Workspace deletion was not confirmed.");
	}
}

function createThinkExMcpServer(env: Cloudflare.Env, principal: McpPrincipal) {
	const holder: { server?: ReturnType<typeof openApiMcpServer> } = {};
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
			if (options.method !== "POST" || !options.path.startsWith(operationPathPrefix)) {
				throw new Error("Unsupported MCP operation request.");
			}

			const operationName = options.path.slice(operationPathPrefix.length);
			const operation = getMcpOperation(operationName);

			if (!operation) {
				throw new Error("Unknown MCP operation.");
			}

			if (operation.name === "workspace_delete_items") {
				const activeServer = holder.server;

				if (!activeServer) {
					throw new Error("MCP server is not ready.");
				}

				await confirmDelete(activeServer, context.requestId);
			}

			return await executeMcpOperation({
				name: operationName,
				body: options.body,
				operationId: `mcp:${String(context.requestId)}:${crypto.randomUUID()}`,
				principal,
			});
		},
	});

	holder.server = server;
	return server;
}

function protectedResourceMetadata() {
	const { issuer, resource } = getOAuthUrls();

	return Response.json({
		resource,
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
	const { issuer, resource } = getOAuthUrls();
	const getLocalJwks = () => withAuth((auth) => auth.api.getJwks());
	const authenticate = mcpHandler(
		{
			// Better Auth supports a JWKS callback at runtime, but its public type only
			// exposes URL strings. A local callback avoids a Worker self-fetch through
			// the public hostname while retaining Better Auth's token verifier.
			jwksUrl: getLocalJwks as unknown as string,
			verifyOptions: {
				audience: resource,
				issuer,
			},
		},
		async (authenticatedRequest, payload) => {
			const server = createThinkExMcpServer(env, getPrincipal(payload));
			return await createMcpHandler(server, { route: mcpPath })(authenticatedRequest, env, ctx);
		},
	);

	return await authenticate(request);
}

export async function routeMcpRequest(
	request: Request,
	env: Cloudflare.Env,
	ctx: ExecutionContext,
): Promise<Response | null> {
	const pathname = new URL(request.url).pathname;
	const isMcpProtocolPath =
		pathname === mcpPath ||
		pathname.startsWith("/.well-known/oauth-protected-resource") ||
		pathname.startsWith("/.well-known/oauth-authorization-server") ||
		pathname.startsWith("/.well-known/openid-configuration");

	if (request.method === "OPTIONS" && isMcpProtocolPath) {
		return mcpCorsPreflightResponse();
	}

	if (
		pathname === "/.well-known/oauth-protected-resource" ||
		pathname === `/.well-known/oauth-protected-resource${mcpPath}`
	) {
		return withMcpCors(protectedResourceMetadata());
	}

	if (
		pathname === "/.well-known/oauth-authorization-server" ||
		pathname === "/.well-known/oauth-authorization-server/api/auth"
	) {
		return await withAuth(async (auth) => {
			return withMcpCors(await oauthProviderAuthServerMetadata(auth)(request));
		});
	}

	if (
		pathname === "/.well-known/openid-configuration" ||
		pathname === "/.well-known/openid-configuration/api/auth"
	) {
		return await withAuth(async (auth) => {
			return withMcpCors(await oauthProviderOpenIdConfigMetadata(auth)(request));
		});
	}

	if (pathname !== mcpPath) {
		return null;
	}

	return withMcpCors(await handleAuthenticatedMcpRequest(request, env, ctx));
}
