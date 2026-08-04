import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkWorkspaceFileUploadAccess } from "#/integrations/autumn/workspace-file-usage";

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

describe("checkWorkspaceFileUploadAccess", () => {
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
								file_uploads: { granted: 20, next_reset_at: null, remaining: 20 },
							},
							subscriptions: [],
						}),
						{ status: 200, headers: { "content-type": "application/json" } },
					);
				}

				if (path === "balances.check") {
					const body = JSON.parse(String(init?.body ?? "{}")) as { customer_id?: string };

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

	it("ensures the Autumn customer exists before balances.check", async () => {
		const access = await checkWorkspaceFileUploadAccess({
			env: { AUTUMN_PROD_SECRET_KEY: "am_sk_live_test" } as Cloudflare.Env,
			userId: CUSTOMER_ID,
		});

		expect(access).toEqual({ allowed: true });
		expect(autumnPaths[0]).toBe("customers.get_or_create");
		expect(autumnPaths).toContain("balances.check");
		expect(operationalFailures.map((failure) => failure.event)).not.toContain(
			"workspace_file_upload_access_check",
		);
	});
});
