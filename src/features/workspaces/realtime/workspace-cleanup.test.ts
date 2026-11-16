import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleteR2Prefix: vi.fn(),
	logOperationalEvent: vi.fn(),
	purgeForDeletion: vi.fn(),
	recordOperationalFailure: vi.fn(),
}));

vi.mock("#/features/workspaces/document-session-access", () => ({
	getDocumentSessionStubFromEnv: () => ({ purgeForDeletion: mocks.purgeForDeletion }),
}));
vi.mock("#/integrations/observability/operational-events", () => ({
	logOperationalEvent: mocks.logOperationalEvent,
	recordOperationalFailure: mocks.recordOperationalFailure,
}));
vi.mock("#/integrations/posthog/server-context", () => ({
	getTelemetryRuntimeContext: () => ({ properties: {} }),
}));
vi.mock("#/lib/r2", () => ({ deleteR2Prefix: mocks.deleteR2Prefix }));

import { purgeDeletedWorkspaceItems } from "#/features/workspaces/realtime/workspace-cleanup";

const env = {} as Cloudflare.Env;
const input = {
	documentItemIds: ["document-1"],
	fileItemIds: [],
	recordingItemIds: [],
	workspaceId: "workspace-1",
};

describe("purgeDeletedWorkspaceItems", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("logs a Durable Object memory reset without capturing an exception", async () => {
		mocks.purgeForDeletion.mockRejectedValue(
			new Error("Durable Object's isolate exceeded its memory limit and was reset."),
		);

		await expect(purgeDeletedWorkspaceItems(env, input)).resolves.toEqual({
			attempted: 1,
			failed: 1,
		});
		expect(mocks.recordOperationalFailure).not.toHaveBeenCalled();
		expect(mocks.logOperationalEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "workspace_document_purge",
				fields: expect.objectContaining({ item_id: "document-1", transient: true }),
				outcome: "rejected",
			}),
		);
	});

	it("captures other document purge failures", async () => {
		const error = new Error("boom");
		mocks.purgeForDeletion.mockRejectedValue(error);

		await expect(purgeDeletedWorkspaceItems(env, input)).resolves.toEqual({
			attempted: 1,
			failed: 1,
		});
		expect(mocks.logOperationalEvent).not.toHaveBeenCalled();
		expect(mocks.recordOperationalFailure).toHaveBeenCalledWith(
			expect.objectContaining({ error, event: "workspace_document_purge" }),
		);
	});
});
