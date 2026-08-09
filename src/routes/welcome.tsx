import { createFileRoute } from "@tanstack/react-router";

import LandingPage from "#/components/LandingPage";
import { buildPublicMeta, getAbsoluteUrl } from "#/lib/seo";
import { getAuthSessionQueryOptions } from "#/lib/session-query";

const UNCACHEABLE = "private, no-store";

/**
 * The marketing page at a path that never redirects based on auth, so it stays
 * reachable once someone is signed in. `/` redirects those visitors to `/home`,
 * which makes it useless as a link target for campaigns, docs, or the site
 * chrome — this is where those should point.
 *
 * Deliberately not in `sitemap.xml`, and canonical points at `/`: this is the
 * same content at a second address, and `/` is the URL that ranks.
 */
export const Route = createFileRoute("/welcome")({
	loader: async ({ context }) => {
		// Resolve this before rendering so the account action never swaps after
		// first paint. Cookie presence is enough for this non-security-sensitive
		// label; `/home` still performs full session validation.
		return import.meta.env.SSR
			? (await import("#/lib/auth-session-cookie.server")).hasSessionCookie()
			: Boolean(await context.queryClient.ensureQueryData(getAuthSessionQueryOptions()));
	},
	head: () => ({
		meta: buildPublicMeta(),
		links: [
			{
				rel: "canonical",
				href: getAbsoluteUrl("/"),
			},
		],
	}),
	headers: () => ({
		"Cache-Control": UNCACHEABLE,
	}),
	component: WelcomeLandingPage,
});

function WelcomeLandingPage() {
	const signedIn = Route.useLoaderData();

	return <LandingPage signedIn={signedIn} />;
}
