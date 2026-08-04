import { describe, expect, it } from "vitest";

import {
	buildWidgetSandboxDocument,
	isWidgetSandboxFrameMessage,
} from "#/features/workspaces/components/widget/workspace-widget-sandbox-document";

function loadsKatex(html: string) {
	return buildWidgetSandboxDocument({
		html,
		theme: "light",
		tokens: { "--background": "oklch(1 0 0)" },
		origin: "https://app.test",
		sessionId: 1,
	}).includes('<script src="https://app.test/widget-libs/katex/katex.min.js"></script>');
}

describe("buildWidgetSandboxDocument", () => {
	// The only real decision in this module: KaTeX is ~290KB plus fonts, so it
	// loads only for widgets that contain math. Over-matching costs a cached
	// fetch; under-matching leaves math unrendered.
	it("loads KaTeX for every math notation a widget may use", () => {
		expect(loadsKatex('<span data-type="inline-math" data-latex="x^2"></span>')).toBe(true);
		expect(loadsKatex("<p>$$E = mc^2$$</p>")).toBe(true);
		expect(loadsKatex("<p>\\(x\\)</p>")).toBe(true);
		expect(loadsKatex("<script>renderMathInElement(el)</script>")).toBe(true);
	});

	it("skips KaTeX for a widget with no math, including prices", () => {
		expect(loadsKatex("<p>Plans cost $30 or $75.</p><button>Buy</button>")).toBe(false);
		expect(loadsKatex("<canvas id='c'></canvas>")).toBe(false);
	});

	it("limits external access to the bundled KaTeX assets", () => {
		const authoredScript = '<script>throw new Error("boom")</script>';
		const document = buildWidgetSandboxDocument({
			html: authoredScript,
			theme: "light",
			tokens: { "--not-a-widget-token": "red" },
			origin: "https://app.test",
			sessionId: 1,
		});

		expect(document).toContain("default-src 'none'");
		expect(document).toContain(
			"style-src 'unsafe-inline' https://app.test/widget-libs/katex/katex.min.css",
		);
		expect(document).toContain(
			"script-src 'unsafe-inline' https://app.test/widget-libs/katex/katex.min.js https://app.test/widget-libs/katex/contrib/mhchem.min.js https://app.test/widget-libs/katex/contrib/auto-render.min.js",
		);
		expect(document).toContain("font-src data: https://app.test/widget-libs/katex/fonts/");
		expect(document).toContain("connect-src 'none'");
		expect(document).not.toContain("--not-a-widget-token");
		expect(document).not.toContain("script-src 'unsafe-inline' https://app.test;");
	});
});

describe("isWidgetSandboxFrameMessage", () => {
	it("rejects messages outside the frame protocol", () => {
		expect(isWidgetSandboxFrameMessage({ kind: "ready", sessionId: 1, source: "other" })).toBe(
			false,
		);
	});
});
