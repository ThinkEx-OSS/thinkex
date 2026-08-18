import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import { getAutumnCustomerFields } from "#/integrations/autumn/client.server";
import {
	attachAutumnPlan,
	getOrCreateAutumnCustomer,
	openAutumnCustomerPortal,
	type AutumnBalance,
} from "#/integrations/autumn/rest";
import { resolveAutumnSecretKey } from "#/integrations/autumn/secret-key";
import { getAppOrigin } from "#/lib/app-origin";
import { withAuth } from "#/lib/auth.server";

/**
 * What the plan UI needs, and nothing else. Autumn's customer response carries
 * invoices, entities, referrals and rewards we never render, and it is the
 * secret key that fetches it — so the shape is narrowed here rather than passed
 * through to the browser wholesale.
 */
export interface WorkspaceBillingState {
	balances: Record<string, Pick<AutumnBalance, "granted" | "next_reset_at" | "remaining">>;
	isPro: boolean;
}

// Both ids, though only monthly is ever sold: an existing annual subscriber
// must still read as Pro rather than being shown Free.
const PRO_PLAN_IDS = {
	annual: "pro_annual",
	monthly: "pro",
} as const;

async function getSignedInUserId() {
	return await withAuth(async (auth) => {
		const session = await auth.api.getSession({ headers: getRequestHeaders() });

		return session?.user.id ?? null;
	});
}

/**
 * getOrCreate rather than get: a customer only exists in Autumn once something
 * bills them, so a user who has never sent a message would otherwise 404 here
 * and see an empty panel instead of their free allowances.
 */
export const getWorkspaceBillingStateFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<WorkspaceBillingState | null> => {
		const userId = await getSignedInUserId();
		const secretKey = resolveAutumnSecretKey(env);

		if (!userId || !secretKey) {
			return null;
		}

		const customerFields = await getAutumnCustomerFields(userId);
		const customer = await getOrCreateAutumnCustomer({
			customerId: userId,
			secretKey,
			...customerFields,
		});

		return {
			balances: Object.fromEntries(
				Object.entries(customer.balances).flatMap(([featureId, balance]) =>
					balance
						? [
								[
									featureId,
									{
										granted: balance.granted,
										next_reset_at: balance.next_reset_at,
										remaining: balance.remaining,
									},
								],
							]
						: [],
				),
			),
			// Scheduled plans sit in the same array as active ones and the status
			// enum is open, so only an explicitly active Pro counts.
			isPro: customer.subscriptions.some(
				(subscription) =>
					Object.values(PRO_PLAN_IDS).some((planId) => planId === subscription.plan_id) &&
					subscription.status === "active",
			),
		};
	},
);

/**
 * Returns a URL for the browser to follow rather than redirecting here: the
 * caller is a button inside a dialog, and a server redirect would tear the whole
 * page down before Stripe answered.
 */
export const startProCheckoutFn = createServerFn({ method: "POST" }).handler(
	async (): Promise<{ url: string | null }> => {
		const userId = await getSignedInUserId();
		const secretKey = resolveAutumnSecretKey(env);

		if (!userId || !secretKey) {
			return { url: null };
		}

		const result = await attachAutumnPlan({
			checkoutSessionParams: {
				// Checkout accepts any active Stripe promotion code, so discounts can
				// be run from the Stripe dashboard without a deploy.
				allow_promotion_codes: true,
				// A fully discounted first period still has to renew at the normal
				// price, so Checkout must collect a payment method regardless.
				payment_method_collection: "always",
			},
			customerId: userId,
			planId: PRO_PLAN_IDS.monthly,
			redirectMode: "always",
			secretKey,
			// Return with the plan dialog open so the updated plan is visible.
			successUrl: `${getAppOrigin()}/home?upgrade=true`,
		});

		return { url: result.payment_url };
	},
);

export const openBillingPortalFn = createServerFn({ method: "POST" }).handler(
	async (): Promise<{ url: string | null }> => {
		const userId = await getSignedInUserId();
		const secretKey = resolveAutumnSecretKey(env);

		if (!userId || !secretKey) {
			return { url: null };
		}

		const result = await openAutumnCustomerPortal({
			customerId: userId,
			returnUrl: `${getAppOrigin()}/home?settings=plan`,
			secretKey,
		});

		return { url: result.url };
	},
);
