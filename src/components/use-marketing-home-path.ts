import { useQuery } from "@tanstack/react-query";
import { useRouterState } from "@tanstack/react-router";

import { getAuthSessionQueryOptions } from "#/lib/session-query";

export type MarketingHomePath = "/" | "/welcome";

/**
 * Where the public chrome's "home" links should point for the current visitor.
 *
 * `/` redirects signed-in visitors to `/home`, which makes every logo and nav
 * link in the marketing chrome a trapdoor back into the app. `/welcome` is the
 * same page without that branch, so signed-in visitors get sent there instead.
 *
 * Signed-out visitors keep getting `/` — including crawlers, which never carry
 * a session — so the internal links still point at the canonical URL.
 */
export function useMarketingHomePath(): MarketingHomePath {
	const pathname = useRouterState({ select: (state) => state.location.pathname });
	const { data: session } = useQuery(getAuthSessionQueryOptions());

	// Checked before the session so the answer is stable across hydration for the
	// page that needs it most: on `/welcome` the destination is `/welcome` for
	// everyone, with no dependency on a query that resolves after first paint.
	if (pathname === "/welcome") {
		return "/welcome";
	}

	return session ? "/welcome" : "/";
}
