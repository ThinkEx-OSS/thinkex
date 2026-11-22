import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import { getAutumnCustomerFields } from "#/integrations/autumn/client.server";
import {
	attachAutumnPlan,
	getOrCreateAutumnCustomer,
	openAutumnCustomerPortal,
	type AutumnBalance,
	type AutumnCustomer,
} from "#/integrations/autumn/rest";
import { resolveAutumnSecretKey } from "#/integrations/autumn/secret-key";
import { getAppOrigin } from "#/lib/app-origin";
import { z } from "zod";

import { withAuth } from "#/lib/auth.server";
import { listWorkspaceMembers } from "#/features/workspaces/members/workspace-members.server";
import { withWorkspaceDb } from "#/features/workspaces/server/workspace-db";

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

// Scheduled plans sit in the same array as active ones and the status enum is
// open, so only an explicitly active Pro counts.
function isProCustomer(customer: AutumnCustomer) {
	return customer.subscriptions.some(
		(subscription) =>
			Object.values(PRO_PLAN_IDS).some((planId) => planId === subscription.plan_id) &&
			subscription.status === "active",
	);
}

// One Autumn request per member, so a hard ceiling on the fan-out. Past this a
// workspace just shows fewer crowns, which is cosmetic.
const MAX_CROWN_LOOKUPS = 50;

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
			isPro: isProCustomer(customer),
		};
	},
);

/**
 * Which members of a workspace are on Pro, for the crowns on collaborator
 * avatars. Gated on being able to read the workspace (listWorkspaceMembers
 * asserts that), and it returns only ids, never balances: the plan is
 * something members show each other, the allowance is not.
 *
 * getOrCreate because Autumn has no plain get on this API surface. Creating a
 * member's customer here is the same record their own first billing call would
 * create, with the same fields, so it is not a new side effect, just an early
 * one. A failed lookup reads as not-Pro rather than failing the whole list.
 */
const workspaceProUserIdsInputSchema = z.object({
	workspaceId: z.string().min(1),
	userIds: z.array(z.string().min(1)).max(MAX_CROWN_LOOKUPS),
});

export const listWorkspaceProUserIdsFn = createServerFn({ method: "GET" })
	.validator(workspaceProUserIdsInputSchema)
	.handler(async ({ data }): Promise<string[]> => {
		const secretKey = resolveAutumnSecretKey(env);

		if (!secretKey) {
			return [];
		}

		// Only ever answers for actual members: the ids come from the browser, and
		// a plan is something members show each other, not anyone who asks.
		const requested = new Set(data.userIds);
		const members = (
			await withWorkspaceDb(({ db, userId }) =>
				listWorkspaceMembers(db, { workspaceId: data.workspaceId, userId }),
			)
		).filter((member) => requested.has(member.userId));

		const results = await Promise.allSettled(
			members.map(async (member) => {
				const customer = await getOrCreateAutumnCustomer({
					customerId: member.userId,
					secretKey,
					...(await getAutumnCustomerFields(member.userId)),
				});

				return isProCustomer(customer) ? member.userId : null;
			}),
		);

		return results.flatMap((result) =>
			result.status === "fulfilled" && result.value ? [result.value] : [],
		);
	});

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
