import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	getAgentByName: vi.fn(),
	purgeDeletedItems: vi.fn(),
	recordOperationalFailure: vi.fn(),
}));

vi.mock("agents", () => ({ getAgentByName: mocks.getAgentByName }));
vi.mock("#/integrations/observability/operational-events", () => ({
	recordOperationalFailure: mocks.recordOperationalFailure,
}));

import { requestWorkspaceItemCleanup } from "#/features/workspaces/realtime/workspace-room-notifier";

const env = {} as Cloudflare.Env;
const input = {
	documentItemIds: ["document-1"],
	fileItemIds: ["file-1"],
	workspaceId: "workspace-1",
};

describe("workspace item cleanup delivery", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.getAgentByName.mockResolvedValue({ purgeDeletedItems: mocks.purgeDeletedItems });
	});

	it("retries transient room delivery failures without retrying accepted resource work", async () => {
		mocks.purgeDeletedItems
			.mockRejectedValueOnce(new Error("temporary"))
			.mockResolvedValueOnce(undefined);

		await requestWorkspaceItemCleanup(env, input);

		expect(mocks.purgeDeletedItems).toHaveBeenCalledTimes(2);
		expect(mocks.recordOperationalFailure).not.toHaveBeenCalled();
	});

	it("records a delivery failure after the final attempt", async () => {
		mocks.purgeDeletedItems.mockRejectedValue(new Error("unavailable"));

		await requestWorkspaceItemCleanup(env, input);

		expect(mocks.purgeDeletedItems).toHaveBeenCalledTimes(3);
		expect(mocks.recordOperationalFailure).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "workspace_item_cleanup_request",
				fields: expect.objectContaining({ attempt: 3 }),
			}),
		);
	});
});
