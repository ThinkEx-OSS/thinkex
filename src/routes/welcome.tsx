import { createFileRoute } from "@tanstack/react-router";

import LandingPage from "#/components/LandingPage";
import { buildPublicMeta, getAbsoluteUrl } from "#/lib/seo";

/**
 * The marketing page at a path that never checks auth, so it stays reachable
 * once someone is signed in. `/` redirects those visitors to `/home`, which
 * makes it useless as a link target for campaigns, docs, or the site chrome —
 * this is where those should point.
 *
 * Deliberately not in `sitemap.xml`, and canonical points at `/`: this is the
 * same content at a second address, and `/` is the URL that ranks.
 */
export const Route = createFileRoute("/welcome")({
	head: () => ({
		meta: buildPublicMeta(),
		links: [
			{
				rel: "canonical",
				href: getAbsoluteUrl("/"),
			},
		],
	}),
	component: LandingPage,
});
