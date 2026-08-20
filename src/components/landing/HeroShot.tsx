import { useSyncExternalStore } from "react";

import { useTheme } from "#/components/theme-provider";

/**
 * The capture is 2936px wide for a slot that is at most 1232 CSS px, so without
 * these a phone downloads and decodes roughly 170KB it cannot use. `sizes`
 * matches the max-w-7xl container minus its padding.
 */
const WIDTHS = [800, 1200, 1800, 2936] as const;
const SIZES = "(min-width: 1280px) 1232px, calc(100vw - 2rem)";

const srcSetFor = (prefix: string) => WIDTHS.map((w) => `${prefix}-${w}.webp ${w}w`).join(", ");

/**
 * False through SSR and the hydration render, true afterwards. The store never
 * changes, so the subscribe callback has nothing to listen to: the whole point
 * is the difference between the server and client snapshots.
 */
const noopSubscribe = () => () => {};
const useHydrated = () =>
	useSyncExternalStore(
		noopSubscribe,
		() => true,
		() => false,
	);

/**
 * The hero screenshot, shot once in each theme.
 *
 * Which one shows is decided by the `<source>` media query rather than by
 * swapping `src` from React. The theme class is applied by a blocking script
 * before first paint, but React only learns the theme after hydration, so a
 * state-driven `src` would flash the light shot on every dark load. Two stacked
 * `<img>`s toggled with `dark:hidden` would avoid the flash but fetch both
 * captures, doubling the largest asset on the page.
 *
 * `prefers-color-scheme` is correct for everyone left on the default "system"
 * setting. It is wrong for anyone who used the header toggle, so once hydrated
 * the query is replaced by a flat on/off following the resolved theme. Either
 * way the browser downloads exactly one of the two.
 */
export function HeroShot() {
	const { resolvedTheme, theme } = useTheme();
	const hydrated = useHydrated();

	const darkMedia =
		hydrated && theme !== "system"
			? resolvedTheme === "dark"
				? "all"
				: "not all"
			: "(prefers-color-scheme: dark)";

	return (
		// `contents` so the picture box does not add a baseline gap under the image.
		<picture className="contents">
			<source
				media={darkMedia}
				srcSet={srcSetFor("/landing-hero-dark")}
				sizes={SIZES}
				type="image/webp"
			/>
			<img
				src="/landing-hero-2936.webp"
				srcSet={srcSetFor("/landing-hero")}
				sizes={SIZES}
				alt="ThinkEx workspace with documents, folders, and AI assistant"
				className="block h-auto w-full"
				width={2936}
				height={1638}
				loading="eager"
				decoding="async"
				fetchPriority="high"
			/>
		</picture>
	);
}
