import { APIError } from "better-auth/api";
import { verifyAccessToken } from "better-auth/oauth2";

import {
	type AccountAccessContext,
	type AccountAccessScope,
	createAccountAccessContext,
} from "#/features/workspaces/operations/account-access-context";
import {
	createWorkspaceAccessContext,
	type WorkspaceAccessContext,
	type WorkspaceAccessScope,
} from "#/features/workspaces/operations/workspace-access-context";
import {
	MCP_SUPPORTED_SCOPES,
	MCP_WORKSPACE_READ_SCOPE,
} from "#/features/workspaces/mcp/mcp-scopes";
import { getAuthBaseURL, getAppOrigin, getMcpResourceUrl } from "#/lib/app-origin";

export interface McpActor {
	userId: string;
	clientId: string | null;
	grantedScopes: ReadonlySet<string>;
}

export class McpAuthError extends Error {
	constructor(
		readonly status: 401 | 403,
		readonly code: string,
	) {
		super(code);
		this.name = "McpAuthError";
	}
}

type AccessTokenPayload = Awaited<ReturnType<typeof verifyAccessToken>>;

function resolveAuthIssuer(): string {
	const baseURL = getAuthBaseURL();

	return typeof baseURL === "string" ? baseURL : getAppOrigin();
}

function resolveJwksBaseUrl(): string {
	const baseURL = getAuthBaseURL();

	if (typeof baseURL === "string") {
		return baseURL;
	}

	return baseURL.fallback ?? getAppOrigin();
}

function parseBearerToken(request: Request): string {
	const authHeader = request.headers.get("Authorization");

	if (!authHeader?.startsWith("Bearer ")) {
		throw new McpAuthError(401, "missing_token");
	}

	const token = authHeader.slice("Bearer ".length).trim();

	if (!token) {
		throw new McpAuthError(401, "missing_token");
	}

	return token;
}

function parseGrantedScopes(payload: AccessTokenPayload): ReadonlySet<string> {
	const scopeClaim = payload.scope;

	if (typeof scopeClaim !== "string" || scopeClaim.length === 0) {
		return new Set();
	}

	return new Set(scopeClaim.split(" ").filter(Boolean));
}

function parseClientId(payload: AccessTokenPayload): string | null {
	const clientId = payload.client_id;

	return typeof clientId === "string" ? clientId : null;
}

export async function verifyMcpBearerToken(request: Request): Promise<McpActor> {
	const token = parseBearerToken(request);
	const issuer = resolveAuthIssuer();
	const jwksBaseUrl = resolveJwksBaseUrl();

	let payload: AccessTokenPayload;

	try {
		payload = await verifyAccessToken(token, {
			jwksUrl: `${jwksBaseUrl}/api/auth/jwks`,
			scopes: [...MCP_SUPPORTED_SCOPES],
			verifyOptions: {
				issuer,
				audience: getMcpResourceUrl(),
			},
		});
	} catch (error) {
		if (error instanceof APIError && error.status === "FORBIDDEN") {
			throw new McpAuthError(403, "insufficient_scope");
		}

		throw new McpAuthError(401, "invalid_token");
	}

	if (!payload.sub) {
		throw new McpAuthError(401, "invalid_token");
	}

	return {
		userId: payload.sub,
		clientId: parseClientId(payload),
		grantedScopes: parseGrantedScopes(payload),
	};
}

export function buildMcpAccountContext(actor: McpActor): AccountAccessContext {
	const scopes: AccountAccessScope[] = [];

	if (actor.grantedScopes.has(MCP_WORKSPACE_READ_SCOPE)) {
		scopes.push("workspaces:read");
	}

	return createAccountAccessContext({
		userId: actor.userId,
		scopes,
	});
}

export function buildMcpWorkspaceContext(
	actor: McpActor,
	workspaceId: string,
): WorkspaceAccessContext {
	const scopes: WorkspaceAccessScope[] = [];

	if (actor.grantedScopes.has(MCP_WORKSPACE_READ_SCOPE)) {
		scopes.push("workspace:read");
	}

	return createWorkspaceAccessContext({
		userId: actor.userId,
		workspaceId,
		scopes,
	});
}
