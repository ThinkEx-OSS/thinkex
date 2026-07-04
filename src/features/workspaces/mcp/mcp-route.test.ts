import { describe, expect, it, vi } from "vitest";

const { createMcpHandler } = vi.hoisted(() => ({
	createMcpHandler: vi.fn(() => vi.fn().mockResolvedValue(new Response("ok"))),
}));

vi.mock("agents/mcp", () => ({
	createMcpHandler,
}));

vi.mock("#/features/workspaces/mcp/mcp-tools", () => ({
	registerMcpTools: vi.fn(),
}));

vi.mock("#/features/workspaces/mcp/mcp-auth", () => ({
	McpAuthError: class McpAuthError extends Error {
		constructor(
			readonly status: 401 | 403,
			readonly code: string,
		) {
			super(code);
			this.name = "McpAuthError";
		}
	},
	verifyMcpBearerToken: vi.fn(),
}));

vi.mock("#/features/workspaces/mcp/mcp-authorization", () => ({
	assertMcpConnectionAuthorized: vi.fn(),
}));

vi.mock("#/lib/app-origin", () => ({
	getMcpProtectedResourceMetadataUrl: () =>
		"https://app.example.com/.well-known/oauth-protected-resource/mcp",
}));

import { McpAuthError, verifyMcpBearerToken } from "#/features/workspaces/mcp/mcp-auth";
import { assertMcpConnectionAuthorized } from "#/features/workspaces/mcp/mcp-authorization";
import { routeMcpRequest } from "#/features/workspaces/mcp/mcp-route";

const actor = {
	userId: "user-1",
	clientId: "client-a",
	grantedScopes: new Set(["workspace:read"]),
};

describe("routeMcpRequest", () => {
	it("returns null for non-MCP paths", async () => {
		const request = new Request("https://app.example.com/api/health");
		const response = await routeMcpRequest(request, {} as Env, {} as ExecutionContext);

		expect(response).toBeNull();
	});

	it("returns 401 with WWW-Authenticate when Authorization header is missing", async () => {
		vi.mocked(verifyMcpBearerToken).mockRejectedValueOnce(new McpAuthError(401, "missing_token"));

		const request = new Request("https://app.example.com/mcp");
		const response = await routeMcpRequest(request, {} as Env, {} as ExecutionContext);

		expect(response?.status).toBe(401);
		expect(response?.headers.get("WWW-Authenticate")).toBe(
			'Bearer error="missing_token", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/mcp"',
		);
		expect(await response?.json()).toEqual({ error: "missing_token" });
	});

	it("returns 401 with WWW-Authenticate when the connection is revoked", async () => {
		vi.mocked(verifyMcpBearerToken).mockResolvedValueOnce(actor);
		vi.mocked(assertMcpConnectionAuthorized).mockRejectedValueOnce(
			new McpAuthError(401, "invalid_token"),
		);

		const request = new Request("https://app.example.com/mcp", {
			headers: { Authorization: "Bearer revoked.token" },
		});
		const response = await routeMcpRequest(request, {} as Env, {} as ExecutionContext);

		expect(assertMcpConnectionAuthorized).toHaveBeenCalledWith(actor);
		expect(response?.status).toBe(401);
		expect(response?.headers.get("WWW-Authenticate")).toBe(
			'Bearer error="invalid_token", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/mcp"',
		);
		expect(await response?.json()).toEqual({ error: "invalid_token" });
		expect(createMcpHandler).not.toHaveBeenCalled();
	});

	it("delegates to createMcpHandler when the connection is authorized", async () => {
		vi.mocked(verifyMcpBearerToken).mockResolvedValueOnce(actor);
		vi.mocked(assertMcpConnectionAuthorized).mockResolvedValueOnce(undefined);

		const request = new Request("https://app.example.com/mcp", {
			headers: { Authorization: "Bearer valid.token" },
		});
		const response = await routeMcpRequest(request, {} as Env, {} as ExecutionContext);

		expect(assertMcpConnectionAuthorized).toHaveBeenCalledWith(actor);
		expect(createMcpHandler).toHaveBeenCalledOnce();
		expect(response?.status).toBe(200);
	});
});
