import { eq } from "drizzle-orm";

import { user } from "#/db/schema";
import { withDb } from "#/db/server";
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

// One retry: the read is a single indexed lookup and the failure seen here is a
// transient Postgres internal error, so a fresh connection usually succeeds.
const MAX_READ_ATTEMPTS = 2;

/**
 * Null means the read failed and the caller must skip the Autumn write: a
 * get_or_create with empty identity fields overwrites the stored name, email, and
 * account type. Defaults are returned only when the user genuinely has no row.
 */
export async function getAutumnCustomerFields(
	userId: string,
): Promise<AutumnCustomerFields | null> {
	let lastError: unknown;

	for (let attempt = 0; attempt < MAX_READ_ATTEMPTS; attempt += 1) {
		try {
			return await withDb(async (db) => {
				const [row] = await db
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
			});
		} catch (error) {
			lastError = error;
		}
	}

	recordOperationalFailure({
		distinctId: userId,
		error: lastError,
		event: "autumn_customer_fields",
	});

	return null;
}

function getNamedCustomerFields(row: { email: string; name: string }) {
	return {
		email: row.email.trim() || undefined,
		name: row.name.trim() || undefined,
	};
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
	const secretKey = resolveAutumnSecretKey(input.env);

	if (!secretKey) {
		return;
	}

	const fields = { ...input.properties, feature_id: input.featureId, user_id: input.userId };

	try {
		const customerFields = await getAutumnCustomerFields(input.userId);

		// Null means the read failed (see getAutumnCustomerFields). Skip the
		// identity write, but still track usage: the customer already exists for
		// anyone metered here, and the meter carries no identity to corrupt.
		if (customerFields) {
			await getOrCreateAutumnCustomer({ customerId: input.userId, secretKey, ...customerFields });
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
