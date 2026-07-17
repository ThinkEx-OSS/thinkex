import { describe, expect, it } from "vitest";

import { isMcpOAuthPath, mcpCorsPreflightResponse, withMcpCors } from "#/features/mcp/mcp-cors";

describe("MCP protocol CORS", () => {
	it("only identifies the public MCP OAuth endpoints", () => {
		expect(isMcpOAuthPath("/api/auth/oauth2/token")).toBe(true);
		expect(isMcpOAuthPath("/api/auth/jwks")).toBe(true);
		expect(isMcpOAuthPath("/api/auth/session")).toBe(false);
	});

	it("returns a reusable preflight response", () => {
		const response = mcpCorsPreflightResponse();

		expect(response.status).toBe(204);
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("access-control-allow-methods")).toContain("POST");
		expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
		expect(response.headers.get("access-control-allow-headers")).toContain("mcp-session-id");
	});

	it("preserves the response while exposing MCP headers", async () => {
		const response = withMcpCors(
			new Response("missing authorization header", {
				status: 401,
				headers: { "WWW-Authenticate": "Bearer" },
			}),
		);

		expect(response.status).toBe(401);
		expect(await response.text()).toBe("missing authorization header");
		expect(response.headers.get("access-control-allow-origin")).toBe("*");
		expect(response.headers.get("access-control-expose-headers")).toContain("www-authenticate");
	});
});
