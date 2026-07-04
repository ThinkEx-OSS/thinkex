import { and, eq } from "drizzle-orm";

import { oauthAccessToken, oauthConsent, oauthRefreshToken } from "#/db/schema";
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
 * Deleting the consent row alone does not stop access: Better Auth leaves the
 * client's issued access/refresh tokens in place, and the client silently mints
 * new access tokens from its refresh token. We also purge the client's tokens
 * for this user so the refresh loop is cut immediately. MCP bearer verification
 * is offline (JWKS only), so an already-issued access token still works until it
 * expires (bounded by `accessTokenExpiresIn`), but it can no longer be renewed.
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

	// Purge tokens and consent atomically so a mid-operation failure can never
	// leave the connection half-revoked (e.g. consent gone but tokens still live).
	await db.batch([
		db
			.delete(oauthAccessToken)
			.where(
				and(
					eq(oauthAccessToken.clientId, consent.clientId),
					eq(oauthAccessToken.userId, input.userId),
				),
			),
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
