import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/db/server", () => ({
	createDbContext: vi.fn(),
}));

vi.mock("better-auth/oauth2", () => ({
	verifyAccessToken: vi.fn(),
}));

vi.mock("#/lib/app-origin", () => ({
	getAppOrigin: () => "https://app.example.com",
	getAuthBaseURL: () => "https://app.example.com",
	getMcpResourceUrl: () => "https://app.example.com/mcp",
}));

import { createDbContext } from "#/db/server";
import { assertMcpConnectionAuthorized } from "#/features/workspaces/mcp/mcp-authorization";
import { McpAuthError } from "#/features/workspaces/mcp/mcp-auth";

function mockDbContext(consentRows: unknown[]) {
	const limit = vi.fn().mockResolvedValue(consentRows);
	const where = vi.fn().mockReturnValue({ limit });
	const from = vi.fn().mockReturnValue({ where });
	const select = vi.fn().mockReturnValue({ from });
	const dispose = vi.fn().mockResolvedValue(undefined);

	vi.mocked(createDbContext).mockResolvedValue({
		db: { select },
		dispose,
	} as never);

	return { select, from, where, limit, dispose };
}

describe("assertMcpConnectionAuthorized", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("throws 401 invalid_token when clientId is null", async () => {
		await expect(
			assertMcpConnectionAuthorized({
				userId: "user-1",
				clientId: null,
				grantedScopes: new Set(["workspace:read"]),
			}),
		).rejects.toMatchObject({
			status: 401,
			code: "invalid_token",
		});

		expect(createDbContext).not.toHaveBeenCalled();
	});

	it("throws 401 invalid_token when consent row is missing", async () => {
		mockDbContext([]);

		await expect(
			assertMcpConnectionAuthorized({
				userId: "user-1",
				clientId: "client-a",
				grantedScopes: new Set(["workspace:read"]),
			}),
		).rejects.toMatchObject({
			status: 401,
			code: "invalid_token",
		});
	});

	it("passes when consent row exists", async () => {
		mockDbContext([{ id: "consent-1" }]);

		await expect(
			assertMcpConnectionAuthorized({
				userId: "user-1",
				clientId: "client-a",
				grantedScopes: new Set(["workspace:read"]),
			}),
		).resolves.toBeUndefined();
	});

	it("errors are McpAuthError instances", async () => {
		await expect(
			assertMcpConnectionAuthorized({
				userId: "user-1",
				clientId: null,
				grantedScopes: new Set(),
			}),
		).rejects.toBeInstanceOf(McpAuthError);
	});
});
