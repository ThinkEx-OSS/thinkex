import { and, eq } from "drizzle-orm";

import { oauthConsent, oauthRefreshToken } from "#/db/schema";
import type { createDbContext } from "#/db/server";

type Db = Awaited<ReturnType<typeof createDbContext>>["db"];

export class OAuthConsentNotFoundError extends Error {
	constructor() {
		super("Authorized connection not found");
		this.name = "OAuthConsentNotFoundError";
	}
}

export class OAuthConsentForbiddenError extends Error {
	constructor() {
		super("Forbidden");
		this.name = "OAuthConsentForbiddenError";
	}
}

/**
 * Revoke an authorized OAuth connection for the current user.
 *
 * Deleting the consent row is what blocks MCP access: `assertMcpConnectionAuthorized`
 * rejects tool calls on the next request. We also purge refresh tokens so the client
 * cannot silently mint new access tokens without going through consent again.
 */
export async function revokeOAuthConnection(
	db: Db,
	input: { consentId: string; userId: string },
): Promise<void> {
	const [consent] = await db
		.select({ clientId: oauthConsent.clientId, userId: oauthConsent.userId })
		.from(oauthConsent)
		.where(eq(oauthConsent.id, input.consentId))
		.limit(1);

	if (!consent) {
		throw new OAuthConsentNotFoundError();
	}

	if (consent.userId !== input.userId) {
		throw new OAuthConsentForbiddenError();
	}

	// Purge consent and refresh tokens atomically so a mid-operation failure can never
	// leave the connection half-revoked (e.g. consent gone but refresh tokens still live).
	await db.batch([
		db
			.delete(oauthRefreshToken)
			.where(
				and(
					eq(oauthRefreshToken.clientId, consent.clientId),
					eq(oauthRefreshToken.userId, input.userId),
				),
			),
		db.delete(oauthConsent).where(eq(oauthConsent.id, input.consentId)),
	]);
}
