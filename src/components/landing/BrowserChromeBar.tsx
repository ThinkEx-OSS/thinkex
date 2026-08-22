import { Lock } from "lucide-react";

import { seo } from "#/lib/seo";

/** Derived rather than written out, so the bar can't drift from the real domain. */
const SITE_HOST = seo.siteUrl.replace(/^https?:\/\//, "");

/**
 * Matches the `/workspaces/$workspaceId` route and the workspace shown in the
 * screenshot. Decorative, so the id is a readable slug rather than a real one.
 */
const DISPLAY_URL = `${SITE_HOST}/workspaces/biology-101`;

/**
 * Fake browser chrome above the hero screenshot, so the capture reads as a real
 * page rather than a floating crop. Just the two parts that carry meaning — the
 * traffic lights and the address — since toolbar icons are texture nobody reads.
 *
 * Follows the theme, which it can only do because the screenshot below it now
 * has a dark capture to switch to; a light-only shot would leave a dark frame
 * wrapped around a light window.
 *
 * Desktop only. On a phone the framing is pure cost: it reads as a strip of
 * clutter above the product rather than as a window, and the vertical space is
 * better spent on the screenshot itself.
 */
export function BrowserChromeBar() {
	return (
		// Decoration: hidden from assistive tech, and unselectable so a drag across
		// the hero can't pick up a URL that isn't really there.
		<div
			className="relative hidden h-11 select-none items-center border-border/60 border-b px-3.5 sm:flex"
			aria-hidden="true"
		>
			<div className="flex items-center gap-2">
				<span className="size-3 rounded-full bg-[#ff5f57]" />
				<span className="size-3 rounded-full bg-[#febc2e]" />
				<span className="size-3 rounded-full bg-[#28c840]" />
			</div>
			{/* Absolutely centred on the bar rather than laid out after the lights, so
			    the address stays centred no matter what sits on either side. */}
			<div className="absolute top-1/2 left-1/2 flex h-7 w-[min(440px,52%)] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-lg bg-muted/70 px-3 text-[13px] text-muted-foreground">
				<Lock className="size-3 shrink-0 opacity-60" />
				<span className="flex-1 truncate text-center">{DISPLAY_URL}</span>
			</div>
			<span className="ml-auto text-[11px] font-medium text-muted-foreground">
				Interactive demo
			</span>
		</div>
	);
}
