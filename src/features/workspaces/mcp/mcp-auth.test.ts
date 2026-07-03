import { describe, expect, it, vi } from "vitest";

vi.mock("better-auth/oauth2", () => ({
	verifyAccessToken: vi.fn(),
}));

vi.mock("better-auth/api", () => ({
	APIError: class APIError extends Error {
		constructor(
			readonly status: string,
			readonly body?: { message?: string },
		) {
			super(body?.message ?? status);
			this.name = "APIError";
		}
	},
}));

vi.mock("#/lib/app-origin", () => ({
	getAppOrigin: () => "https://app.example.com",
	getAuthBaseURL: () => "https://app.example.com",
	getMcpResourceUrl: () => "https://app.example.com/mcp",
}));

import { verifyAccessToken } from "better-auth/oauth2";
import { APIError } from "better-auth/api";
import {
	buildMcpAccountContext,
	buildMcpWorkspaceContext,
	McpAuthError,
	verifyMcpBearerToken,
} from "#/features/workspaces/mcp/mcp-auth";

function makeRequest(authHeader?: string): Request {
	const headers: Record<string, string> = authHeader ? { Authorization: authHeader } : {};
	return new Request("https://app.example.com/mcp", { headers });
}

describe("verifyMcpBearerToken", () => {
	it("throws 401 missing_token when Authorization header is absent", async () => {
		await expect(verifyMcpBearerToken(makeRequest())).rejects.toMatchObject({
			status: 401,
			code: "missing_token",
		});
	});

	it("throws 401 missing_token when Authorization header is not Bearer", async () => {
		await expect(verifyMcpBearerToken(makeRequest("Basic dXNlcjpwYXNz"))).rejects.toMatchObject({
			status: 401,
			code: "missing_token",
		});
	});

	it("throws 401 missing_token when Bearer value is blank", async () => {
		await expect(verifyMcpBearerToken(makeRequest("Bearer "))).rejects.toMatchObject({
			status: 401,
			code: "missing_token",
		});
	});

	it("throws 401 invalid_token when verifyAccessToken rejects (expired token)", async () => {
		vi.mocked(verifyAccessToken).mockRejectedValueOnce(new Error("Token expired"));
		await expect(verifyMcpBearerToken(makeRequest("Bearer expired.token"))).rejects.toMatchObject({
			status: 401,
			code: "invalid_token",
		});
	});

	it("throws 401 invalid_token when payload has no sub claim", async () => {
		vi.mocked(verifyAccessToken).mockResolvedValueOnce({ scope: "workspace:read" } as never);
		await expect(verifyMcpBearerToken(makeRequest("Bearer no-sub.token"))).rejects.toMatchObject({
			status: 401,
			code: "invalid_token",
		});
	});

	it("returns McpActor for a valid token with scopes and client_id", async () => {
		vi.mocked(verifyAccessToken).mockResolvedValueOnce({
			sub: "user-1",
			client_id: "client-a",
			scope: "workspace:read openid",
		} as never);

		const actor = await verifyMcpBearerToken(makeRequest("Bearer valid.token"));

		expect(actor).toEqual({
			userId: "user-1",
			clientId: "client-a",
			grantedScopes: new Set(["workspace:read", "openid"]),
		});
	});

	it("verifies access tokens against the MCP resource audience", async () => {
		vi.mocked(verifyAccessToken).mockResolvedValueOnce({
			sub: "user-1",
			scope: "workspace:read",
		} as never);

		await verifyMcpBearerToken(makeRequest("Bearer valid.token"));

		expect(verifyAccessToken).toHaveBeenCalledWith("valid.token", {
			jwksUrl: "https://app.example.com/api/auth/jwks",
			scopes: ["workspace:read"],
			verifyOptions: {
				issuer: "https://app.example.com",
				audience: "https://app.example.com/mcp",
			},
		});
	});

	it("throws 403 insufficient_scope when verifyAccessToken rejects missing scope", async () => {
		vi.mocked(verifyAccessToken).mockRejectedValueOnce(
			new APIError("FORBIDDEN", { message: "invalid scope workspace:read" }),
		);

		await expect(verifyMcpBearerToken(makeRequest("Bearer scoped.token"))).rejects.toMatchObject({
			status: 403,
			code: "insufficient_scope",
		});
	});

	it("returns null clientId when client_id is absent from payload", async () => {
		vi.mocked(verifyAccessToken).mockResolvedValueOnce({
			sub: "user-2",
			scope: "workspace:read",
		} as never);

		const actor = await verifyMcpBearerToken(makeRequest("Bearer valid.no-client.token"));

		expect(actor.clientId).toBeNull();
	});

	it("throws 401 invalid_token when scope claim is absent from a rejected token", async () => {
		vi.mocked(verifyAccessToken).mockRejectedValueOnce(
			new APIError("FORBIDDEN", { message: "invalid scope workspace:read" }),
		);

		await expect(
			verifyMcpBearerToken(makeRequest("Bearer valid.no-scope.token")),
		).rejects.toMatchObject({
			status: 403,
			code: "insufficient_scope",
		});
	});

	it("errors are McpAuthError instances", async () => {
		await expect(verifyMcpBearerToken(makeRequest())).rejects.toBeInstanceOf(McpAuthError);
	});
});

describe("buildMcpAccountContext scope mapping", () => {
	it("includes workspaces:read when actor has workspace:read grant", () => {
		const actor = {
			userId: "u1",
			clientId: null,
			grantedScopes: new Set(["workspace:read"]),
		};
		const ctx = buildMcpAccountContext(actor);
		expect(ctx.actor.scopes.has("workspaces:read")).toBe(true);
	});

	it("excludes workspaces:read when actor has no grants", () => {
		const actor = { userId: "u1", clientId: null, grantedScopes: new Set<string>() };
		const ctx = buildMcpAccountContext(actor);
		expect(ctx.actor.scopes.has("workspaces:read")).toBe(false);
	});

	it("excludes workspaces:read when actor has unrelated scopes only", () => {
		const actor = {
			userId: "u1",
			clientId: null,
			grantedScopes: new Set(["openid", "profile"]),
		};
		const ctx = buildMcpAccountContext(actor);
		expect(ctx.actor.scopes.has("workspaces:read")).toBe(false);
	});
});

describe("buildMcpWorkspaceContext scope mapping", () => {
	it("includes workspace:read when actor has workspace:read grant", () => {
		const actor = {
			userId: "u1",
			clientId: null,
			grantedScopes: new Set(["workspace:read"]),
		};
		const ctx = buildMcpWorkspaceContext(actor, "ws-1");
		expect(ctx.actor.scopes.has("workspace:read")).toBe(true);
	});

	it("excludes workspace:read when actor has no grants", () => {
		const actor = { userId: "u1", clientId: null, grantedScopes: new Set<string>() };
		const ctx = buildMcpWorkspaceContext(actor, "ws-1");
		expect(ctx.actor.scopes.has("workspace:read")).toBe(false);
	});

	it("never includes workspace:write even when actor carries workspace:write in granted scopes", () => {
		const actor = {
			userId: "u1",
			clientId: null,
			grantedScopes: new Set(["workspace:read", "workspace:write"]),
		};
		const ctx = buildMcpWorkspaceContext(actor, "ws-1");
		expect(ctx.actor.scopes.has("workspace:write")).toBe(false);
	});

	it("carries the workspaceId into the context", () => {
		const actor = {
			userId: "u1",
			clientId: null,
			grantedScopes: new Set(["workspace:read"]),
		};
		const ctx = buildMcpWorkspaceContext(actor, "ws-42");
		expect(ctx.workspaceId).toBe("ws-42");
	});
});
