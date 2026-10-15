import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerByName = vi.hoisted(() => vi.fn());
const recordOperationalOutcome = vi.hoisted(() => vi.fn());

vi.mock("partyserver", () => ({ getServerByName }));
vi.mock("#/integrations/observability/operational-events", () => ({ recordOperationalOutcome }));

import { getDocumentSessionFromEnv } from "#/features/workspaces/document-session-access";

const env = { DocumentSession: {} } as Cloudflare.Env;
const input = { itemId: "item-1", workspaceId: "workspace-1" };

function storageResetError() {
	return Object.assign(
		new Error("Internal error in Durable Object storage caused object to be reset; reference = x"),
		{ durableObjectReset: true },
	);
}

describe("getDocumentSessionFromEnv", () => {
	beforeEach(() => {
		getServerByName.mockReset();
		recordOperationalOutcome.mockReset();
	});

	it("retries a storage reset and records the recovery", async () => {
		const session = { readHtmlChunk: vi.fn() };
		getServerByName.mockRejectedValueOnce(storageResetError()).mockResolvedValueOnce(session);

		await expect(getDocumentSessionFromEnv(env, input)).resolves.toBe(session);
		expect(getServerByName).toHaveBeenCalledTimes(2);
		expect(getServerByName).toHaveBeenCalledWith(env.DocumentSession, expect.any(String), {
			routingRetry: false,
		});
		expect(recordOperationalOutcome).toHaveBeenCalledWith(
			expect.objectContaining({
				event: "document_session_open_retry",
				fields: expect.objectContaining({ attempts: 2, recovered: true }),
				outcome: "success",
			}),
		);
	});

	it("stops after the attempt limit and rethrows the reset", async () => {
		const error = storageResetError();
		getServerByName.mockRejectedValue(error);

		await expect(getDocumentSessionFromEnv(env, input)).rejects.toBe(error);
		expect(getServerByName).toHaveBeenCalledTimes(3);
		expect(recordOperationalOutcome).toHaveBeenCalledWith(
			expect.objectContaining({
				fields: expect.objectContaining({ attempts: 3, recovered: false }),
				outcome: "rejected",
			}),
		);
	});

	it("does not retry other errors or overloaded objects", async () => {
		const overloaded = Object.assign(new Error("overloaded"), {
			overloaded: true,
			retryable: true,
		});
		getServerByName.mockRejectedValueOnce(new Error("boom")).mockRejectedValueOnce(overloaded);

		await expect(getDocumentSessionFromEnv(env, input)).rejects.toThrow("boom");
		await expect(getDocumentSessionFromEnv(env, input)).rejects.toBe(overloaded);
		expect(getServerByName).toHaveBeenCalledTimes(2);
		expect(recordOperationalOutcome).not.toHaveBeenCalled();
	});
});
