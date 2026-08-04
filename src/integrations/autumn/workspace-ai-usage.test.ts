import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkWorkspaceAiMessageAccess } from "#/integrations/autumn/workspace-ai-usage";

const CUSTOMER_ID = "tZ4W20sCB3qPZwIf7Bf5F64bOUhz2P0l";
const CUSTOMER_NOT_FOUND_BODY = JSON.stringify({
	message: `Customer ${CUSTOMER_ID} not found`,
	code: "customer_not_found",
	env: "live",
});

const autumnPaths: string[] = [];
const operationalFailures: Array<{ error: unknown; event: string }> = [];

vi.mock("#/db/server", () => ({
	createDbContext: async () => {
		throw new Error("no db in unit test");
	},
}));

vi.mock("#/integrations/observability/operational-events", () => ({
	recordOperationalFailure: (input: { error: unknown; event: string }) => {
		operationalFailures.push({ error: input.error, event: input.event });
	},
}));

vi.mock("#/integrations/posthog/server", () => ({
	capturePostHogServerEvent: vi.fn(),
}));

function autumnPathFromUrl(url: string) {
	return url.replace("https://api.useautumn.com/v1/", "");
}

describe("checkWorkspaceAiMessageAccess", () => {
	beforeEach(() => {
		autumnPaths.length = 0;
		operationalFailures.length = 0;

		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				const path = autumnPathFromUrl(url);
				autumnPaths.push(path);

				if (path === "customers.get_or_create") {
					return new Response(
						JSON.stringify({
							id: CUSTOMER_ID,
							balances: {
								standard_messages: { granted: 50, next_reset_at: null, remaining: 50 },
								premium_messages: { granted: 10, next_reset_at: null, remaining: 10 },
							},
							subscriptions: [],
						}),
						{ status: 200, headers: { "content-type": "application/json" } },
					);
				}

				if (path === "balances.check") {
					const body = JSON.parse(String(init?.body ?? "{}")) as { customer_id?: string };

					// Reproduce the production 404: Autumn rejects check when the
					// customer was never created. get_or_create above would have made
					// this path succeed — so a call sequence that hits this branch means
					// the access check skipped ensure-customer.
					if (body.customer_id === CUSTOMER_ID && !autumnPaths.includes("customers.get_or_create")) {
						return new Response(CUSTOMER_NOT_FOUND_BODY, {
							status: 404,
							headers: { "content-type": "application/json" },
						});
					}

					return new Response(JSON.stringify({ allowed: true, balance: null }), {
						status: 200,
						headers: { "content-type": "application/json" },
					});
				}

				throw new Error(`Unexpected Autumn path: ${path}`);
			}),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	// Regression for ThinkEx-OSS/thinkex#727: balances.check 404 customer_not_found.
	// Autumn requires customers.get_or_create before check; track/billing already do
	// that, but the AI access gate did not — so a user who has never been billed
	// throws on their first message check, gets fail-opened, and lands in PostHog.
	it("ensures the Autumn customer exists before balances.check", async () => {
		const access = await checkWorkspaceAiMessageAccess({
			env: { AUTUMN_PROD_SECRET_KEY: "am_sk_live_test" } as Cloudflare.Env,
			modelId: "auto",
			userId: CUSTOMER_ID,
		});

		expect(access).toEqual({ allowed: true, modelId: "auto" });
		expect(autumnPaths[0]).toBe("customers.get_or_create");
		expect(autumnPaths).toContain("balances.check");
		// DB is stubbed out above, so autumn_customer_fields may log; the access
		// check itself must not.
		expect(operationalFailures.map((failure) => failure.event)).not.toContain(
			"workspace_ai_access_check",
		);
	});
});
