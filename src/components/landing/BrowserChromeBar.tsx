import { Lock } from "lucide-react";

import { seo } from "#/lib/seo";

/** Derived rather than written out, so the bar can't drift from the real domain. */
const SITE_HOST = seo.siteUrl.replace(/^https?:\/\//, "");

/**
 * Matches the `/workspaces/$workspaceId` route and the workspace shown in the
 * screenshot. Decorative, so the id is a readable slug rather than a real one.
 */
const DISPLAY_URL = `${SITE_HOST}/workspaces/biology-lab`;

/*
 * Frozen light-mode values, not tokens. The screenshot below is a capture of the
 * light UI and can't follow the theme, so chrome that did follow it would leave a
 * dark frame wrapped around a light window. These are the light theme's own
 * --background / --border / --muted / --muted-foreground, pinned so dark mode
 * renders the bar identically.
 */
const BAR_BG = "oklch(0.976 0.003 106.6)";
const BAR_BORDER = "oklch(0.885 0.007 97.3 / 0.6)";
const PILL_BG = "oklch(0.927 0.007 97.3 / 0.7)";
const PILL_TEXT = "oklch(0.52 0.011 93.6)";

/**
 * Fake browser chrome above the hero screenshot, so the capture reads as a real
 * page rather than a floating crop. Just the two parts that carry meaning — the
 * traffic lights and the address — since toolbar icons are texture nobody reads.
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
			className="relative hidden h-11 select-none items-center border-b px-3.5 sm:flex"
			style={{ backgroundColor: BAR_BG, borderBottomColor: BAR_BORDER }}
			aria-hidden="true"
		>
			<div className="flex items-center gap-2">
				<span className="size-3 rounded-full bg-[#ff5f57]" />
				<span className="size-3 rounded-full bg-[#febc2e]" />
				<span className="size-3 rounded-full bg-[#28c840]" />
			</div>
			{/* Absolutely centred on the bar rather than laid out after the lights, so
			    the address stays centred no matter what sits on either side. */}
			<div
				className="absolute top-1/2 left-1/2 flex h-7 w-[min(440px,52%)] -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-lg px-3 text-[13px]"
				style={{ backgroundColor: PILL_BG, color: PILL_TEXT }}
			>
				<Lock className="size-3 shrink-0 opacity-60" />
				<span className="flex-1 truncate text-center">{DISPLAY_URL}</span>
			</div>
		</div>
	);
}
