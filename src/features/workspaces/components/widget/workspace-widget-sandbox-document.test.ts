import { describe, expect, it } from "vitest";

import {
	buildWidgetSandboxDocument,
	detectWidgetLibraries,
	isWidgetSandboxFrameMessage,
} from "#/features/workspaces/components/widget/workspace-widget-sandbox-document";

function documentFor(html: string) {
	return buildWidgetSandboxDocument({
		html,
		theme: "light",
		tokens: { "--background": "oklch(1 0 0)" },
		origin: "https://app.test",
		sessionId: 1,
	});
}

function loadsKatex(html: string) {
	return documentFor(html).includes(
		'<script src="https://app.test/widget-libs/katex/katex.min.js"></script>',
	);
}

describe("buildWidgetSandboxDocument", () => {
	it("loads KaTeX only for document-style math markup", () => {
		expect(loadsKatex('<span data-type="inline-math" data-latex="x^2"></span>')).toBe(true);
		expect(loadsKatex("<script>node.dataset.latex = 'x^2'</script>")).toBe(true);
		expect(loadsKatex("<p>$$E = mc^2$$</p>")).toBe(false);
		expect(loadsKatex("<p>Plans cost $30 or $75.</p><button>Buy</button>")).toBe(false);
	});

	it("loads the graphing libraries only when the widget references them", () => {
		const graph = documentFor(
			"<script>const p = math.compile('x^2'); new uPlot({}, [], el);</script>",
		);
		expect(graph).toContain('<script src="https://app.test/widget-libs/mathjs/math.js"></script>');
		expect(graph).toContain(
			'<link rel="stylesheet" href="https://app.test/widget-libs/uplot/uPlot.min.css" />',
		);
		expect(graph).toContain(
			'<script src="https://app.test/widget-libs/uplot/uPlot.iife.min.js"></script>',
		);

		// The CSP allow-list names every bundled library, but a plain widget must
		// not inject their script or style tags.
		const plain = documentFor("<p>No graph here</p>");
		expect(plain).not.toContain('<script src="https://app.test/widget-libs/mathjs/math.js">');
		expect(plain).not.toContain('/widget-libs/uplot/uPlot.iife.min.js"></script>');
	});

	it("limits external access to the bundled assets", () => {
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
			"style-src 'unsafe-inline' https://app.test/widget-libs/katex/katex.min.css https://app.test/widget-libs/uplot/uPlot.min.css",
		);
		expect(document).toContain(
			"script-src 'unsafe-inline' https://app.test/widget-libs/katex/katex.min.js https://app.test/widget-libs/katex/contrib/mhchem.min.js https://app.test/widget-libs/mathjs/math.js https://app.test/widget-libs/uplot/uPlot.iife.min.js",
		);
		expect(document).toContain("font-src data: https://app.test/widget-libs/katex/fonts/");
		expect(document).toContain("connect-src 'none'");
		// The frame runs untrusted inline scripts already, so it must never gain eval.
		expect(document).not.toContain("'unsafe-eval'");
		expect(document).not.toContain("--not-a-widget-token");
		expect(document).not.toContain("script-src 'unsafe-inline' https://app.test;");
	});
});

describe("detectWidgetLibraries", () => {
	it("flags each bundled library from its authored markup", () => {
		expect(detectWidgetLibraries('<span data-latex="x^2"></span>').katex).toBe(true);
		expect(detectWidgetLibraries("<script>math.compile('x^2')</script>").mathjs).toBe(true);
		expect(detectWidgetLibraries("<script>new uPlot(opts, data, el)</script>").uplot).toBe(true);
		expect(detectWidgetLibraries("<p>plain widget</p>")).toEqual({
			katex: false,
			mathjs: false,
			uplot: false,
		});
	});
});

describe("isWidgetSandboxFrameMessage", () => {
	it("rejects messages outside the frame protocol", () => {
		expect(isWidgetSandboxFrameMessage({ kind: "ready", sessionId: 1, source: "other" })).toBe(
			false,
		);
	});
});
