import type { WorkspaceAgentInput } from "../support/harness";
import type { ContentCheck } from "../support/scorers";

/**
 * How well do models author math, currency, and chemistry across our surfaces?
 *
 * Each surface has a different, silently-failing contract:
 *  - document HTML wants `data-latex` markup and plain-text currency;
 *  - a chat reply wants `$…$` delimiters and backslash-escaped currency;
 *  - widget HTML runs in a sandbox that renders either dialect.
 * Nothing errors when a model picks the wrong one — a document just shows
 * literal dollar signs forever — so only content grading catches it.
 *
 * Prompts are deliberately written the way a real user types: casual, and
 * never naming markup. A prompt that says "use data-latex" would grade the
 * prompt rather than the system prompt we actually ship.
 */
export interface MathAuthoringCase {
	name: string;
	/** Which shipped contract this case exercises. */
	surface: "document" | "chat" | "widget";
	input: WorkspaceAgentInput;
	expectedTools?: string[];
	contentChecks: ContentCheck[];
}

// --- Shipped-contract patterns ------------------------------------------------
const MATH_MARKUP = {
	label: 'data-type="inline-math"/"block-math" markup',
	pattern: /data-type="(inline|block)-math"/,
};
// A dollar pair only counts as math if real LaTeX sits between the delimiters.
// Plain `/\$…\$/` matched across two prices ("$30/hour … $75/hour") and reported
// currency as math — a false failure indistinguishable from a real one.
const DOLLAR_MATH = {
	label: "$…$ math delimiters",
	pattern: /\$[^$\n]{0,80}\\[a-zA-Z]+[^$\n]{0,80}\$/,
};
const BRACKET_MATH = { label: "\\(…\\) or \\[…\\] delimiters", pattern: /\\\(|\\\[/ };
const SUB_SUP_TAGS = { label: "<sub>/<sup> tags", pattern: /<\/?(sub|sup)>/ };
const ESCAPED_DOLLAR = { label: "backslash-escaped \\$", pattern: /\\\$/ };
// Must not match the `$8` inside an already-escaped `\$80`, so require the
// dollar to be unescaped.
const PLAIN_DOLLAR_AMOUNT = {
	label: "unescaped $30-style amount",
	// Excludes both `\$80` (already escaped) and `$$2000…` (display math that
	// happens to open with a digit) — both were scored as unescaped currency.
	pattern: /(^|[^\\$])\$\d/,
};
const MHCHEM = { label: "\\ce{…}", pattern: /\\+ce\{/ };
const DOLLAR_INSIDE_LATEX = {
	label: "dollar signs inside data-latex",
	pattern: /data-latex="[^"]*\$/,
};

const documentContent = (checks: Omit<ContentCheck, "source">): ContentCheck => ({
	source: { tool: "workspace_create_items" },
	...checks,
});

export const mathAuthoringCases: MathAuthoringCase[] = [
	// --- Documents ------------------------------------------------------------
	{
		name: "doc: study sheet with formulas",
		surface: "document",
		input: { prompt: "can you make me a study sheet on the quadratic formula" },
		expectedTools: ["workspace_create_items"],
		contentChecks: [
			documentContent({
				mustMatch: [MATH_MARKUP],
				mustNotMatch: [DOLLAR_MATH, BRACKET_MATH, SUB_SUP_TAGS, DOLLAR_INSIDE_LATEX],
			}),
		],
	},
	{
		name: "doc: exponents and subscripts in prose",
		surface: "document",
		input: {
			prompt:
				"write up a short doc explaining scientific notation, use something like 6.02 times 10 to the 23 as an example",
		},
		expectedTools: ["workspace_create_items"],
		contentChecks: [
			documentContent({ mustMatch: [MATH_MARKUP], mustNotMatch: [SUB_SUP_TAGS, DOLLAR_MATH] }),
		],
	},
	{
		name: "doc: chemistry equation",
		surface: "document",
		input: { prompt: "make me a doc for chem class on what happens when methane burns" },
		expectedTools: ["workspace_create_items"],
		contentChecks: [
			documentContent({ mustMatch: [MHCHEM], mustNotMatch: [SUB_SUP_TAGS, DOLLAR_MATH] }),
		],
	},
	{
		name: "doc: prices only (currency must stay plain)",
		surface: "document",
		input: {
			prompt:
				"make a doc for my tutoring rates - 30 an hour normally, 75 an hour for exam prep, 200 for a 3 session bundle",
		},
		expectedTools: ["workspace_create_items"],
		contentChecks: [documentContent({ mustNotMatch: [ESCAPED_DOLLAR] })],
	},
	{
		name: "doc: money AND math together (opposite dollar rules)",
		surface: "document",
		input: {
			prompt:
				"write me a doc on compound interest, show the formula and work through an example with 5000 dollars at 4% for 10 years",
		},
		expectedTools: ["workspace_create_items"],
		contentChecks: [
			documentContent({ mustMatch: [MATH_MARKUP], mustNotMatch: [ESCAPED_DOLLAR, DOLLAR_MATH] }),
		],
	},

	// --- Chat replies ---------------------------------------------------------
	{
		name: "chat: explain a formula",
		surface: "chat",
		input: { prompt: "whats the quadratic formula again and how do i use it" },
		contentChecks: [{ source: "text", mustMatch: [DOLLAR_MATH], mustNotMatch: [BRACKET_MATH] }],
	},
	{
		name: "chat: money question",
		surface: "chat",
		input: { prompt: "a jacket is 80 bucks and its 25% off, whats the final price" },
		contentChecks: [{ source: "text", mustNotMatch: [PLAIN_DOLLAR_AMOUNT] }],
	},
	{
		name: "chat: money and math in one answer",
		surface: "chat",
		input: {
			prompt: "if i invest 2000 at 5% compounded yearly for 3 years how much do i end up with",
		},
		contentChecks: [{ source: "text", mustNotMatch: [PLAIN_DOLLAR_AMOUNT, BRACKET_MATH] }],
	},

	// --- Widgets --------------------------------------------------------------
	{
		name: "widget: interactive with a formula",
		surface: "widget",
		input: { prompt: "build me something interactive to play with sine waves" },
		expectedTools: ["workspace_create_items"],
		contentChecks: [
			{
				source: { tool: "workspace_create_items" },
				mustNotMatch: [{ label: "<html>/<body> wrapper", pattern: /<\/?(html|body|head)[\s>]/ }],
			},
		],
	},
];
