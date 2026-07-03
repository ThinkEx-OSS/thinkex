import { describe, expect, it, vi } from "vitest";

vi.mock("agents/mcp", () => ({
	createMcpHandler: vi.fn(),
}));

vi.mock("#/features/workspaces/mcp/mcp-tools", () => ({
	registerMcpTools: vi.fn(),
}));

vi.mock("#/lib/app-origin", () => ({
	getMcpProtectedResourceMetadataUrl: () =>
		"https://app.example.com/.well-known/oauth-protected-resource/mcp",
}));

import { routeMcpRequest } from "#/features/workspaces/mcp/mcp-route";

describe("routeMcpRequest", () => {
	it("returns null for non-MCP paths", async () => {
		const request = new Request("https://app.example.com/api/health");
		const response = await routeMcpRequest(request, {} as Env, {} as ExecutionContext);

		expect(response).toBeNull();
	});

	it("returns 401 with WWW-Authenticate when Authorization header is missing", async () => {
		const request = new Request("https://app.example.com/mcp");
		const response = await routeMcpRequest(request, {} as Env, {} as ExecutionContext);

		expect(response?.status).toBe(401);
		expect(response?.headers.get("WWW-Authenticate")).toBe(
			'Bearer error="missing_token", resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/mcp"',
		);
		expect(await response?.json()).toEqual({ error: "missing_token" });
	});
});
