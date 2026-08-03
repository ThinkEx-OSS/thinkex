import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Settings moved from a page to a dialog driven by the `settings` search param.
 * Kept as a redirect so existing links, bookmarks, and upgrade prompts still
 * land somewhere sensible instead of 404ing.
 */
export const Route = createFileRoute("/_protected/settings")({
	beforeLoad: () => {
		throw redirect({ to: "/home", search: { settings: "account" } });
	},
});
