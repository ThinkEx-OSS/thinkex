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
	it("loads KaTeX only for document-style math markup", () => {
		expect(loadsKatex('<span data-type="inline-math" data-latex="x^2"></span>')).toBe(true);
		expect(loadsKatex("<script>node.dataset.latex = 'x^2'</script>")).toBe(true);
		expect(loadsKatex("<p>$$E = mc^2$$</p>")).toBe(false);
		expect(loadsKatex("<p>Plans cost $30 or $75.</p><button>Buy</button>")).toBe(false);
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
			"script-src 'unsafe-inline' https://app.test/widget-libs/katex/katex.min.js https://app.test/widget-libs/katex/contrib/mhchem.min.js",
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
