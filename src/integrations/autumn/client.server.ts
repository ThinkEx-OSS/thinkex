import { eq } from "drizzle-orm";

import { user } from "#/db/schema";
import { createDbContext } from "#/db/server";
import { getOrCreateAutumnCustomer, trackAutumnBalance } from "#/integrations/autumn/rest";
import { resolveAutumnSecretKey } from "#/integrations/autumn/secret-key";
import { recordOperationalFailure } from "#/integrations/observability/operational-events";

export interface AutumnCustomerFields {
	email?: string;
	metadata: {
		account_type?: "anonymous" | "registered";
		email_verified?: boolean;
		source: "thinkex";
		user_created_at?: string;
	};
	name?: string;
}

const DEFAULT_AUTUMN_CUSTOMER_FIELDS = {
	metadata: {
		source: "thinkex",
	},
} as const satisfies AutumnCustomerFields;

export async function getAutumnCustomerFields(userId: string): Promise<AutumnCustomerFields> {
	let dbContext: Awaited<ReturnType<typeof createDbContext>> | undefined;

	try {
		dbContext = await createDbContext();

		const [row] = await dbContext.db
			.select({
				createdAt: user.createdAt,
				email: user.email,
				emailVerified: user.emailVerified,
				isAnonymous: user.isAnonymous,
				name: user.name,
			})
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);

		if (!row) {
			return DEFAULT_AUTUMN_CUSTOMER_FIELDS;
		}

		const isAnonymous = Boolean(row.isAnonymous);

		return {
			...(isAnonymous ? {} : getNamedCustomerFields(row)),
			metadata: {
				...DEFAULT_AUTUMN_CUSTOMER_FIELDS.metadata,
				account_type: isAnonymous ? "anonymous" : "registered",
				email_verified: row.emailVerified,
				user_created_at: row.createdAt.toISOString(),
			},
		};
	} catch (error) {
		recordOperationalFailure({
			distinctId: userId,
			error,
			event: "autumn_customer_fields",
		});

		return DEFAULT_AUTUMN_CUSTOMER_FIELDS;
	} finally {
		await dbContext?.dispose();
	}
}

function getNamedCustomerFields(row: { email: string; name: string }) {
	return {
		email: row.email.trim() || undefined,
		name: row.name.trim() || undefined,
	};
}

/**
 * Autumn rejects balances.check / balances.track for unknown customers
 * (`customer_not_found`). Track and billing already called get_or_create; the
 * access gates must too, or a user who has never been billed 404s on their
 * first check, fail-opens, and lands in PostHog (ThinkEx-OSS/thinkex#727).
 *
 * Returns the resolved secret key so callers can keep going without a second
 * env lookup, or undefined when billing is not configured.
 */
export async function ensureAutumnCustomer(input: {
	env: Cloudflare.Env;
	userId: string;
}): Promise<string | undefined> {
	const secretKey = resolveAutumnSecretKey(input.env);

	if (!secretKey) {
		return undefined;
	}

	const customerFields = await getAutumnCustomerFields(input.userId);

	await getOrCreateAutumnCustomer({ customerId: input.userId, secretKey, ...customerFields });

	return secretKey;
}

export interface TrackAutumnUsageInput {
	env: Cloudflare.Env;
	/** Operational event name, used for both the partial log and the failure. */
	event: string;
	featureId: string;
	/** Sent to Autumn, and mirrored into the operational log. */
	properties: Record<string, boolean | number | string | null>;
	userId: string;
}

/**
 * Ensures the customer exists, then records one unit of usage. Shared because
 * the getOrCreate / track / partial-response / failure handling is identical for
 * every metered feature — only the feature id and properties differ.
 */
export async function trackAutumnUsage(input: TrackAutumnUsageInput) {
	const fields = { ...input.properties, feature_id: input.featureId, user_id: input.userId };

	try {
		const secretKey = await ensureAutumnCustomer({ env: input.env, userId: input.userId });

		if (!secretKey) {
			return;
		}

		await trackAutumnBalance({
			customerId: input.userId,
			featureId: input.featureId,
			properties: input.properties,
			secretKey,
		});
	} catch (error) {
		recordOperationalFailure({ distinctId: input.userId, error, event: input.event, fields });
	}
}
