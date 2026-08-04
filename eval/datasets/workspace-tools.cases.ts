import type { WorkspaceAgentInput } from "../support/harness";
import type { ContentCheck } from "../support/scorers";

export interface WorkspaceToolCase {
	name: string;
	input: WorkspaceAgentInput;
	/** Tools that MUST be called (order-independent, at least once). */
	expectedTools?: string[];
	/** Tools that must NOT be called (e.g. writes on a view-only turn). */
	forbiddenTools?: string[];
	/** When set, the final answer is graded by the LLM judge against this rubric. */
	qualityRubric?: string;
	/** When true, the turn must produce a targeted edit whose editRef traces to the read fixture. */
	requiresTargetedEditFromRead?: boolean;
	/** Grade what the model wrote — the answer text, or a tool's arguments. */
	contentChecks?: ContentCheck[];
}

// Math is authored differently per surface and the failure is silent: `$x^2$` in
// document HTML is schema-valid and renders as literal dollar signs forever, so
// only a content check catches it. These patterns encode the shipped contract.
const DOCUMENT_MATH_MARKUP = {
	label: "a math block with data-latex",
	pattern:
		/<[^>]*(?:data-type=["'](?:inline|block)-math["'][^>]*data-latex=["'][^"']+["']|data-latex=["'][^"']+["'][^>]*data-type=["'](?:inline|block)-math["'])[^>]*>/,
};
const DOLLAR_DELIMITED_MATH = { label: "$...$ math delimiters", pattern: /\$[^$\n]+\$/ };
const BRACKET_DELIMITED_MATH = { label: "\\(...\\) bracket delimiters", pattern: /\\\(|\\\[/ };
const SUB_SUP_TAGS = { label: "<sub>/<sup> tags", pattern: /<\/?(sub|sup)>/ };
const ESCAPED_DOLLAR = { label: "backslash-escaped \\$", pattern: /\\\$/ };
const MHCHEM_CE = { label: "\\ce{...} chemistry", pattern: /\\\\?ce\{/ };
const DOCUMENT_WIDGET_MARKUP = {
	label: "a document widget block",
	pattern: /data-type=["']widget["']/,
};
const DOCUMENT_WIDGET_SOURCE = {
	label: "encoded widget source",
	pattern: /data-type=["']widget["'][^>]*>[\s\S]*&lt;[a-z]/i,
};
const FULL_HTML_DOCUMENT = { label: "a full HTML document", pattern: /<(html|head|body)\b/i };

const PLAIN_PRICES = ["30", "60", "90"].map((price) => ({
	label: `$${price}`,
	pattern: new RegExp(`\\$${price}\\b`),
}));

export const workspaceToolCases: WorkspaceToolCase[] = [
	{
		name: "create a document at an explicit path",
		input: {
			prompt:
				"Create a new document at /Notes/Standup.md with a short heading 'Standup' and one bullet 'Discuss roadmap'.",
		},
		expectedTools: ["workspace_create_items"],
		forbiddenTools: ["workspace_delete_items"],
	},
	{
		name: "interactive requests create a document with a widget block",
		input: {
			prompt:
				"Create /Physics/Wave Explorer.md with an interactive widget that lets me adjust wave frequency and see the wave update.",
		},
		expectedTools: ["workspace_create_items"],
		contentChecks: [
			{
				source: { tool: "workspace_create_items" },
				mustMatch: [DOCUMENT_WIDGET_MARKUP, DOCUMENT_WIDGET_SOURCE],
				mustNotMatch: [FULL_HTML_DOCUMENT],
			},
		],
	},
	{
		name: "search before answering a content question",
		input: {
			prompt: "What did we decide about pricing? Look through the workspace before answering.",
		},
		expectedTools: ["workspace_search"],
		forbiddenTools: ["workspace_create_items", "workspace_edit_item"],
	},
	{
		name: "list a folder by absolute path",
		input: { prompt: "List everything inside the /Projects folder." },
		expectedTools: ["workspace_list_items"],
	},
	{
		name: "read then edit an existing document",
		input: {
			prompt:
				"In /Notes/Standup.md, add a second bullet that says 'Review metrics'. Read the document first, then make the edit.",
		},
		expectedTools: ["workspace_read_items", "workspace_edit_item"],
		requiresTargetedEditFromRead: true,
	},
	{
		name: "respects a read-only turn",
		input: {
			canMutate: false,
			prompt: "Please delete the /Archive folder and everything in it.",
		},
		forbiddenTools: [
			"workspace_delete_items",
			"workspace_create_items",
			"workspace_edit_item",
			"workspace_move_items",
			"workspace_rename_item",
		],
		qualityRubric:
			"The answer declines to make changes and explains that the workspace is currently view-only, rather than claiming it deleted anything.",
	},
	{
		name: "answers a general question without touching tools",
		input: {
			prompt: "In one sentence, what is the difference between a folder and a document here?",
		},
		forbiddenTools: [
			"workspace_create_items",
			"workspace_edit_item",
			"workspace_delete_items",
			"workspace_search",
		],
		qualityRubric:
			"The answer correctly explains that a folder contains items while a document holds content, in roughly one sentence.",
	},

	// ---- Math authoring, per surface -------------------------------------------
	// The shipped contract: documents use data-latex markup and never dollar
	// delimiters; chat replies use dollar delimiters and never brackets; literal
	// currency is escaped in Markdown but plain in document HTML.
	{
		name: "document math uses data-latex markup, never dollar delimiters",
		input: {
			prompt:
				"Create a document at /Notes/Quadratic.md that explains the quadratic formula and shows the formula itself, plus the discriminant b^2 - 4ac.",
		},
		expectedTools: ["workspace_create_items"],
		contentChecks: [
			{
				source: { tool: "workspace_create_items" },
				mustMatch: [DOCUMENT_MATH_MARKUP],
				mustNotMatch: [DOLLAR_DELIMITED_MATH, BRACKET_DELIMITED_MATH, SUB_SUP_TAGS],
			},
		],
	},
	{
		name: "document chemistry uses \\ce inside math markup",
		input: {
			prompt:
				"Create a document at /Notes/Combustion.md showing the balanced equation for methane combustion and the standard gravity constant with units.",
		},
		expectedTools: ["workspace_create_items"],
		contentChecks: [
			{
				source: { tool: "workspace_create_items" },
				mustMatch: [DOCUMENT_MATH_MARKUP, MHCHEM_CE],
				mustNotMatch: [DOLLAR_DELIMITED_MATH, SUB_SUP_TAGS],
			},
		],
	},
	{
		name: "document currency stays plain, not markdown-escaped",
		input: {
			prompt:
				"Create a document at /Notes/Pricing.md listing three tiers costing $30, $60 and $90 per month.",
		},
		expectedTools: ["workspace_create_items"],
		contentChecks: [
			{
				source: { tool: "workspace_create_items" },
				mustMatch: PLAIN_PRICES,
				mustNotMatch: [ESCAPED_DOLLAR],
			},
		],
	},
	{
		name: "chat math uses dollar delimiters, never brackets",
		input: {
			prompt:
				"Explain the quadratic formula in a couple of sentences and show the formula. Answer in chat; do not create anything.",
		},
		forbiddenTools: ["workspace_create_items", "workspace_edit_item"],
		contentChecks: [
			{
				source: "text",
				mustMatch: [DOLLAR_DELIMITED_MATH],
				mustNotMatch: [BRACKET_DELIMITED_MATH],
			},
		],
	},
	{
		name: "chat escapes literal currency",
		input: {
			prompt:
				"A jacket costs $80 and is 25% off. What is the sale price? Answer in chat; do not create anything.",
		},
		forbiddenTools: ["workspace_create_items"],
		contentChecks: [{ source: "text", mustMatch: [ESCAPED_DOLLAR] }],
	},
];
