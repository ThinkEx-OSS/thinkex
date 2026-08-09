import { createFileRoute, redirect } from "@tanstack/react-router";

import LandingPage from "#/components/LandingPage";
import { buildPublicMeta, getAbsoluteUrl } from "#/lib/seo";
import { hasClientAuthSessionForPublicRoute } from "#/lib/session-query";

/** Neither branch of this route may be stored by a shared cache. See below. */
const UNCACHEABLE = "private, no-store";

export const Route = createFileRoute("/")({
	/**
	 * The only route that branches on auth: signed-in visitors get the app,
	 * everyone else gets marketing. The branch has to resolve before anything
	 * renders — decide it in a component or an effect instead and a signed-in
	 * visitor sees a frame of the landing page on the way to `/home`.
	 *
	 * `/welcome` is the same page with no branch, so a signed-in user still has
	 * somewhere to read the marketing copy. Link campaigns there, not here.
	 */
	beforeLoad: async ({ context }) => {
		// Server: a cookie read is enough and costs nothing. Validating here would
		// put a D1 round trip ahead of every anonymous landing page view, which is
		// the page we rank on. Client: the cookie is HttpOnly and unreadable, but
		// the session query is already resolved and cached, so it costs nothing
		// either. `import.meta.env.SSR` is statically false in the client build, so
		// the server module never enters the browser bundle.
		const signedIn = import.meta.env.SSR
			? (await import("#/lib/auth-session-cookie.server")).hasSessionCookie()
			: await hasClientAuthSessionForPublicRoute(context.queryClient);

		if (signedIn) {
			throw redirect({ to: "/home", headers: { "Cache-Control": UNCACHEABLE } });
		}
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
	/**
	 * This response depends on a cookie, and Cloudflare's cache key does not
	 * include cookies. A stored copy would pin whichever branch happened to fill
	 * it onto every later visitor — the signed-in ones would get served marketing
	 * instead of being redirected. Workers Cache is off (see `wrangler.jsonc`),
	 * so this is belt and braces, but it is the declaration that stays correct if
	 * it is ever switched on.
	 */
	headers: () => ({
		"Cache-Control": UNCACHEABLE,
	}),
	component: LandingPage,
});
