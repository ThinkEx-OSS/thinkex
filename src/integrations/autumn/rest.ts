/**
 * Autumn over plain HTTP, in place of the SDK.
 *
 * The SDK ships ~24MB of JavaScript and builds over a thousand Zod schemas as it
 * evaluates, which is enough on its own to blow Cloudflare's Worker startup CPU
 * limit and have the deploy rejected. We call six endpoints; a typed fetch is a
 * fraction of the weight and none of the startup cost.
 *
 * The wire format is snake_case in both directions. Converting it would mean
 * re-deriving every response shape, so the types below mirror the wire exactly
 * and callers read snake_case fields.
 */
const AUTUMN_API_BASE_URL = "https://api.useautumn.com/v1";

export interface AutumnBalance {
	granted: number;
	next_reset_at: number | null;
	remaining: number;
}

export interface AutumnSubscription {
	plan_id: string;
	status: string;
}

export interface AutumnCustomer {
	id: string;
	balances: Record<string, AutumnBalance | undefined>;
	subscriptions: AutumnSubscription[];
}

export interface AutumnCheckResult {
	allowed: boolean;
	balance: AutumnBalance | null;
}

class AutumnRequestError extends Error {
	constructor(
		message: string,
		readonly code?: string,
	) {
		super(message);
	}
}

function getAutumnErrorCode(body: string) {
	try {
		return (JSON.parse(body) as { code?: string }).code;
	} catch {
		return undefined;
	}
}

async function autumnRequest<TResult>(input: {
	body: Record<string, unknown>;
	path: string;
	secretKey: string;
}): Promise<TResult> {
	const response = await fetch(`${AUTUMN_API_BASE_URL}/${input.path}`, {
		method: "POST",
		headers: {
			authorization: `Bearer ${input.secretKey}`,
			"content-type": "application/json",
		},
		body: JSON.stringify(input.body),
	});

	const body = await response.text();

	if (!response.ok) {
		throw new AutumnRequestError(
			`Autumn ${input.path} failed with ${response.status}: ${body.slice(0, 200)}`,
			getAutumnErrorCode(body),
		);
	}

	// Parsed from text because an accepted async event answers 202 with no body,
	// and response.json() throws on empty input.
	return (body ? JSON.parse(body) : undefined) as TResult;
}

export async function checkAutumnBalance(input: {
	customerId: string;
	featureId: string;
	secretKey: string;
}) {
	const check = () =>
		autumnRequest<AutumnCheckResult>({
			body: { customer_id: input.customerId, feature_id: input.featureId },
			path: "balances.check",
			secretKey: input.secretKey,
		});

	try {
		return await check();
	} catch (error) {
		if (!(error instanceof AutumnRequestError) || error.code !== "customer_not_found") {
			throw error;
		}

		// Callers use authenticated user IDs. Recover legacy users once, then keep
		// Autumn's strict error behavior for every other missing resource.
		await getOrCreateAutumnCustomer({
			customerId: input.customerId,
			secretKey: input.secretKey,
		});
		return check();
	}
}

/**
 * `value: 1` because every meter here counts events, not units — a message is a
 * message whatever model answered it. `async` because nothing reads the updated
 * balance back, so there is no reason to make the caller wait for it.
 */
export function trackAutumnBalance(input: {
	customerId: string;
	featureId: string;
	properties?: Record<string, unknown>;
	secretKey: string;
}) {
	return autumnRequest<unknown>({
		body: {
			async: true,
			customer_id: input.customerId,
			feature_id: input.featureId,
			properties: input.properties,
			value: 1,
		},
		path: "balances.track",
		secretKey: input.secretKey,
	});
}

export function getOrCreateAutumnCustomer(input: {
	customerId: string;
	email?: string;
	metadata?: Record<string, unknown>;
	name?: string;
	secretKey: string;
}) {
	return autumnRequest<AutumnCustomer>({
		body: {
			customer_id: input.customerId,
			email: input.email,
			metadata: input.metadata,
			name: input.name,
		},
		path: "customers.get_or_create",
		secretKey: input.secretKey,
	});
}

export function getAutumnCustomer(input: { customerId: string; secretKey: string }) {
	return autumnRequest<AutumnCustomer>({
		body: { customer_id: input.customerId },
		path: "customers.get",
		secretKey: input.secretKey,
	});
}

/** Null when the plan needs no payment, which is why callers must handle both. */
export function attachAutumnPlan(input: {
	checkoutSessionParams?: Record<string, unknown>;
	customerId: string;
	planId: string;
	promotionCode?: string;
	redirectMode?: "always" | "if_required" | "never";
	secretKey: string;
	successUrl?: string;
}) {
	return autumnRequest<{ payment_url: string | null }>({
		body: {
			checkout_session_params: input.checkoutSessionParams,
			customer_id: input.customerId,
			discounts: input.promotionCode ? [{ promotion_code: input.promotionCode }] : undefined,
			plan_id: input.planId,
			redirect_mode: input.redirectMode,
			success_url: input.successUrl,
		},
		path: "billing.attach",
		secretKey: input.secretKey,
	});
}

export function openAutumnCustomerPortal(input: {
	customerId: string;
	returnUrl?: string;
	secretKey: string;
}) {
	return autumnRequest<{ url: string }>({
		body: { customer_id: input.customerId, return_url: input.returnUrl },
		path: "billing.open_customer_portal",
		secretKey: input.secretKey,
	});
}
