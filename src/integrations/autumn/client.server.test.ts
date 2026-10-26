import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("#/db/server", () => ({
	withDb: vi.fn(),
}));

vi.mock("#/integrations/observability/operational-events", () => ({
	recordOperationalFailure: vi.fn(),
}));

vi.mock("#/integrations/autumn/rest", () => ({
	getOrCreateAutumnCustomer: vi.fn(async () => ({ balances: {}, id: "u", subscriptions: [] })),
	trackAutumnBalance: vi.fn(async () => undefined),
}));

import { withDb } from "#/db/server";
import { getAutumnCustomerFields, trackAutumnUsage } from "#/integrations/autumn/client.server";
import { getOrCreateAutumnCustomer, trackAutumnBalance } from "#/integrations/autumn/rest";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

const REGISTERED_ROW = {
	createdAt: new Date("2026-01-02T03:04:05.000Z"),
	email: "person@example.com",
	emailVerified: true,
	isAnonymous: false,
	name: "Ada Example",
};

// Runs the caller's handler against a db stub whose query resolves to `rows`,
// mirroring a successful `withDb` attempt.
function readsRows(rows: unknown[]) {
	const db = {
		select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) }),
	};

	return (handler: (db: unknown) => unknown) => handler(db);
}

afterEach(() => {
	vi.clearAllMocks();
});

describe("getAutumnCustomerFields", () => {
	it("maps a registered user row into customer fields", async () => {
		vi.mocked(withDb).mockImplementationOnce(readsRows([REGISTERED_ROW]) as never);

		await expect(getAutumnCustomerFields("user_1")).resolves.toEqual({
			email: "person@example.com",
			name: "Ada Example",
			metadata: {
				account_type: "registered",
				email_verified: true,
				source: "thinkex",
				user_created_at: "2026-01-02T03:04:05.000Z",
			},
		});
		expect(recordOperationalFailure).not.toHaveBeenCalled();
	});

	it("returns defaults when the user has no row", async () => {
		vi.mocked(withDb).mockImplementationOnce(readsRows([]) as never);

		await expect(getAutumnCustomerFields("user_1")).resolves.toEqual({
			metadata: { source: "thinkex" },
		});
	});

	it("retries once and recovers from a transient read failure", async () => {
		vi.mocked(withDb)
			.mockRejectedValueOnce(new Error("Internal error."))
			.mockImplementationOnce(readsRows([REGISTERED_ROW]) as never);

		await expect(getAutumnCustomerFields("user_1")).resolves.toMatchObject({
			email: "person@example.com",
		});
		expect(withDb).toHaveBeenCalledTimes(2);
		expect(recordOperationalFailure).not.toHaveBeenCalled();
	});

	it("returns null and records one failure when both reads fail", async () => {
		const error = new Error("Internal error.");
		vi.mocked(withDb).mockRejectedValue(error);

		await expect(getAutumnCustomerFields("user_1")).resolves.toBeNull();
		expect(withDb).toHaveBeenCalledTimes(2);
		expect(recordOperationalFailure).toHaveBeenCalledTimes(1);
		expect(recordOperationalFailure).toHaveBeenCalledWith({
			distinctId: "user_1",
			error,
			event: "autumn_customer_fields",
		});
	});
});

describe("trackAutumnUsage", () => {
	it("skips get_or_create but still tracks usage when the identity read fails", async () => {
		vi.mocked(withDb).mockRejectedValue(new Error("Internal error."));

		await trackAutumnUsage({
			env: { AUTUMN_SECRET_KEY: "am_sk_test" } as never,
			event: "workspace_ai_usage",
			featureId: "messages",
			properties: {},
			userId: "user_1",
		});

		expect(getOrCreateAutumnCustomer).not.toHaveBeenCalled();
		expect(trackAutumnBalance).toHaveBeenCalledTimes(1);
	});
});
