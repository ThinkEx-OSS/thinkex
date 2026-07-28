import { describe, expect, it } from "vitest";

import {
	escapeCurrencyDollars,
	normalizeLlmMarkdown,
	rewriteAlternativeDelimiters,
} from "#/features/workspaces/components/ai-chat/normalize-llm-markdown";

describe("rewriteAlternativeDelimiters", () => {
	it("rewrites inline bracket math to single dollars", () => {
		expect(rewriteAlternativeDelimiters("a \\(x^2\\) b")).toBe("a $x^2$ b");
	});

	it("rewrites display bracket math to double dollars", () => {
		expect(rewriteAlternativeDelimiters("\\[a + b\\]")).toBe("$$a + b$$");
	});

	it("accepts a double leading backslash from JSON-double-escaped tool outputs", () => {
		expect(rewriteAlternativeDelimiters("\\\\(x\\\\)")).toBe("$x$");
	});

	it("trims the captured body", () => {
		expect(rewriteAlternativeDelimiters("\\( x \\)")).toBe("$x$");
	});

	it("spans newlines only for display math", () => {
		expect(rewriteAlternativeDelimiters("\\[a\nb\\]")).toBe("$$a\nb$$");
		expect(rewriteAlternativeDelimiters("\\(a\nb\\)")).toBe("\\(a\nb\\)");
	});

	it("rewrites [/math] and [/inline] custom tags", () => {
		expect(rewriteAlternativeDelimiters("[/math]a+b[/math] and [/inline]c[/inline]")).toBe(
			"$$a+b$$ and $c$",
		);
	});

	it("leaves text without alternative delimiters untouched", () => {
		expect(rewriteAlternativeDelimiters("plain $x$ text")).toBe("plain $x$ text");
	});
});

describe("escapeCurrencyDollars", () => {
	it("escapes an unpaired currency-signature dollar", () => {
		expect(escapeCurrencyDollars("$1,299 total")).toBe("\\$1,299 total");
	});

	it("escapes currency arithmetic that models forget to escape", () => {
		expect(escapeCurrencyDollars("costs $5 and $10 total")).toBe("costs \\$5 and \\$10 total");
	});

	it("escapes dangling-operator currency pairs", () => {
		expect(escapeCurrencyDollars("$45 + $3.60 + $9.00 = $57.60")).toBe(
			"\\$45 + \\$3.60 + \\$9.00 = \\$57.60",
		);
	});

	it("preserves numeric-only inline math $6$ and $5$", () => {
		expect(escapeCurrencyDollars("multiply to $6$ and add to $5$")).toBe(
			"multiply to $6$ and add to $5$",
		);
	});

	it("preserves algebra that opens with a digit is not possible; letters win", () => {
		expect(escapeCurrencyDollars("$x^2 + 5x = 10$")).toBe("$x^2 + 5x = 10$");
	});

	it("leaves display math intact", () => {
		expect(escapeCurrencyDollars("$$5x + 3 = 0$$")).toBe("$$5x + 3 = 0$$");
	});

	it("does not double-escape an already-escaped dollar", () => {
		expect(escapeCurrencyDollars("already \\$5")).toBe("already \\$5");
	});

	it("preserves the run of backslashes before a currency dollar", () => {
		expect(escapeCurrencyDollars("\\\\$5")).toBe("\\\\\\$5");
	});
});

describe("normalizeLlmMarkdown — combined pipeline", () => {
	it("normalizes bracket delimiters at raw-string level", () => {
		expect(normalizeLlmMarkdown("Solve \\(x^2 = 4\\).")).toBe("Solve $x^2 = 4$.");
	});

	it("escapes currency without touching \\(...\\)-turned-math", () => {
		expect(normalizeLlmMarkdown("Result: \\(x = 5\\). Costs $5.")).toBe(
			"Result: $x = 5$. Costs \\$5.",
		);
	});

	it("does not corrupt LaTeX inside inline code", () => {
		expect(normalizeLlmMarkdown("Use `\\(x^2\\)` for inline math.")).toBe(
			"Use `\\(x^2\\)` for inline math.",
		);
	});

	it("does not corrupt LaTeX inside a fenced code block", () => {
		expect(normalizeLlmMarkdown("```latex\n\\(x^2\\)\n\\[E=mc^2\\]\n```\n\nAnd \\(y^2\\).")).toBe(
			"```latex\n\\(x^2\\)\n\\[E=mc^2\\]\n```\n\nAnd $y^2$.",
		);
	});

	it("does not escape a currency-looking dollar sign inside inline code", () => {
		expect(normalizeLlmMarkdown("Set `$PATH` and pay $5.")).toBe("Set `$PATH` and pay \\$5.");
	});

	it("handles GPT-mini's typical cut-off currency arithmetic block", () => {
		const input = "**$45 + $3.60 + $9.00 = $57.60**";
		const output = normalizeLlmMarkdown(input);
		expect(output).toBe("**\\$45 + \\$3.60 + \\$9.00 = \\$57.60**");
	});

	it("handles a real GPT-mini system-of-equations response with backslash drift", () => {
		const input =
			"From the second equation:\n\n\\[\nx = y + 1\n\\]\n\nNow plug back into \\(x = y + 1\\):\n\n\\[\nx = 3\n\\]";
		const output = normalizeLlmMarkdown(input);
		expect(output).toBe(
			"From the second equation:\n\n$$x = y + 1$$\n\nNow plug back into $x = y + 1$:\n\n$$x = 3$$",
		);
	});

	it("returns empty input unchanged", () => {
		expect(normalizeLlmMarkdown("")).toBe("");
	});
});
