import { getSessionCookie } from "better-auth/cookies";
import { getRequest } from "@tanstack/react-start/server";

import { getAuthCookiePrefix } from "#/lib/app-origin";

/**
 * Whether the request carries a session cookie. Presence only — this never
 * validates the token against the database.
 *
 * It exists so the marketing root can decide where to send a visitor without
 * putting a database session lookup in front of every anonymous page view. Nothing
 * security-relevant may depend on it: everything it routes to sits behind
 * `_protected`, which does the real check, so the worst case for a stale or
 * forged cookie is a bounce to `/login`.
 *
 * Uses better-auth's own reader rather than a hand-rolled cookie match so the
 * `__Secure-` prefix (production only) and the prefix separator stay in sync
 * with whatever `auth.server.ts` is configured to write.
 */
export function hasSessionCookie() {
	return getSessionCookie(getRequest(), { cookiePrefix: getAuthCookiePrefix() }) !== null;
}
