import { afterEach, describe, expect, it, vi } from "vitest";

import { attachAutumnPlan, checkAutumnBalance } from "#/integrations/autumn/rest";

const CHECK_INPUT = {
	customerId: "existing_thinkex_user",
	featureId: "file_uploads",
	secretKey: "am_sk_live_test",
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("checkAutumnBalance", () => {
	it("creates a missing Autumn customer and retries once", async () => {
		const paths: string[] = [];
		const responses = [
			new Response(JSON.stringify({ code: "customer_not_found" }), { status: 404 }),
			new Response(JSON.stringify({ id: CHECK_INPUT.customerId })),
			new Response(JSON.stringify({ allowed: true, balance: null })),
		];
		vi.stubGlobal("fetch", async (url: string) => {
			paths.push(new URL(url).pathname.split("/").at(-1) ?? "");
			return responses.shift();
		});

		await expect(checkAutumnBalance(CHECK_INPUT)).resolves.toEqual({
			allowed: true,
			balance: null,
		});
		expect(paths).toEqual(["balances.check", "customers.get_or_create", "balances.check"]);
	});
});

describe("attachAutumnPlan", () => {
	it("passes an auto-applied promotion code into Stripe checkout through Autumn", async () => {
		let body: Record<string, unknown> | undefined;
		vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
			if (typeof init?.body !== "string") {
				throw new TypeError("Expected a JSON request body");
			}
			body = JSON.parse(init.body);
			return new Response(JSON.stringify({ payment_url: "https://checkout.stripe.com/test" }));
		});

		await attachAutumnPlan({
			checkoutSessionParams: { payment_method_collection: "always" },
			customerId: "discounted_user",
			planId: "pro_annual",
			promotionCode: "PROMO2026",
			redirectMode: "always",
			secretKey: "am_sk_test",
		});

		expect(body).toMatchObject({
			checkout_session_params: { payment_method_collection: "always" },
			discounts: [{ promotion_code: "PROMO2026" }],
			plan_id: "pro_annual",
			redirect_mode: "always",
		});
	});
});
