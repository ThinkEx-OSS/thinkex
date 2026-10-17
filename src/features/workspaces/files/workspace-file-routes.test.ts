import { beforeEach, describe, expect, it, vi } from "vitest";

const getSessionFromRequest = vi.hoisted(() => vi.fn());
const readWorkspaceFilePreview = vi.hoisted(() => vi.fn());
const readWorkspaceFileSource = vi.hoisted(() => vi.fn());
const recordOperationalFailure = vi.hoisted(() => vi.fn());

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("#/lib/auth-queries.server", () => ({ getSessionFromRequest }));
vi.mock("#/features/workspaces/persistence/workspace-files", () => ({
	readWorkspaceFilePreview,
	readWorkspaceFileSource,
}));
vi.mock("#/integrations/observability/operational-events", () => ({ recordOperationalFailure }));
vi.mock("#/integrations/posthog/server-context", () => ({
	getTelemetryRequestDetails: () => ({}),
}));

import { WorkspaceItemNotFoundError } from "#/features/workspaces/persistence/workspace-postgres-support";
import { handleWorkspaceFileContent } from "#/routes/api/v1/workspaces.$workspaceId.files.$itemId.content";
import { handleWorkspaceFilePreview } from "#/routes/api/v1/workspaces.$workspaceId.files.$itemId.preview";

beforeEach(() => {
	vi.clearAllMocks();
	getSessionFromRequest.mockResolvedValue({ user: { id: "user-1" } });
});

describe("workspace file routes", () => {
	it.each([
		["preview", handleWorkspaceFilePreview, readWorkspaceFilePreview],
		["content", handleWorkspaceFileContent, readWorkspaceFileSource],
	])(
		"returns 404 without capturing a failure when the %s item is missing",
		async (_, handler, read) => {
			read.mockRejectedValue(new WorkspaceItemNotFoundError());

			const response = await handler(
				new Request("https://thinkex.test/file"),
				"workspace-1",
				"missing-item",
			);

			expect(response.status).toBe(404);
			expect(recordOperationalFailure).not.toHaveBeenCalled();
		},
	);
});
