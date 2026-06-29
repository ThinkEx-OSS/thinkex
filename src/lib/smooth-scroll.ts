/** Scroll the main viewport to the top (smooth unless reduced motion is preferred). */
export function smoothScrollViewportTop() {
	if (typeof window === "undefined") return;
	const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
	requestAnimationFrame(() => {
		const root =
			document.querySelector("[data-scroll-root]") ??
			document.scrollingElement ??
			document.documentElement;
		root.scrollTo({ top: 0, left: 0, behavior });
	});
}
