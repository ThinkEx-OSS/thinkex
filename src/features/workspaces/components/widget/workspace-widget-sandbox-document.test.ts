import { describe, expect, it } from "vitest";

import { buildWidgetSandboxDocument } from "#/features/workspaces/components/widget/workspace-widget-sandbox-document";

function loadsKatex(html: string) {
	return buildWidgetSandboxDocument({
		html,
		theme: "light",
		tokens: { "--background": "oklch(1 0 0)" },
		origin: "https://app.test",
	}).includes("katex.min.js");
}

describe("buildWidgetSandboxDocument", () => {
	// The only real decision in this module: KaTeX is ~290KB plus fonts, so it
	// loads only for widgets that contain math. Over-matching costs a cached
	// fetch; under-matching leaves math unrendered.
	it("loads KaTeX for every math notation a widget may use", () => {
		expect(loadsKatex('<span data-type="inline-math" data-latex="x^2"></span>')).toBe(true);
		expect(loadsKatex("<p>$$E = mc^2$$</p>")).toBe(true);
		expect(loadsKatex("<p>\\(x\\)</p>")).toBe(true);
		expect(loadsKatex("<p>Solve $x + 1$ now</p>")).toBe(true);
		expect(loadsKatex("<script>renderMathInElement(el)</script>")).toBe(true);
	});

	it("skips KaTeX for a widget with no math, including prices", () => {
		expect(loadsKatex("<p>Total: $30</p><button>Buy</button>")).toBe(false);
		expect(loadsKatex("<canvas id='c'></canvas>")).toBe(false);
	});
});
