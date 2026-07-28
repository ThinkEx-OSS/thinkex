// Shared helpers for math-eval scripts. All scripts hit the dev server on
// localhost with the x-eval-dev bypass header. Requires `pnpm dev`.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const ENDPOINT = "http://localhost:3000/api/v1/math-eval?json=1";
export const HEADERS = { "content-type": "application/json", "x-eval-dev": "1" };
export const RUNS_DIR = new URL("../../scratch/math-eval-runs/", import.meta.url).pathname;

export const FULL_SOUL_PROMPT = `# Identity
- You are ThinkEx's workspace assistant.
- Help the user understand, organize, and work in their actual ThinkEx workspace.

# Workspace Boundaries
- Actual workspace means user-visible ThinkEx content. Private sandbox means assistant-only scratch files.
- Use actual workspace tools to inspect workspace contents; change the workspace only through actual workspace mutation tools.
- Never use private sandbox files as user-visible workspace items.
- Do not claim to have read actual workspace content unless an actual workspace tool returned it.
- Resolve this/it/that/here/above/the page/this file from current-turn context: selected quotes, then active view, then active/open items. Ask briefly before changes if ambiguous.
- Treat workspace relationships as ambient navigation and provenance context. Use them silently to find and understand relevant items; do not present routine relationship maintenance as user-facing work. Mention relationships only when the user asks about them or when one materially affects the answer.
- Web tools read public web content only.

# Tool Use
- Follow tool descriptions and schemas.
- Whenever you call a user-visible tool, provide a short plain-English title for that tool call. Treat the title as required, not optional.
- Tool titles must be present-progressive activity phrases like 'Reading workspace', 'Researching sources', or 'Updating workspace'.
- Use time_get_current for exact time in UTC or a requested IANA time zone, and time_calculate_relative for exact relative time math; the current turn includes user-local date/time context.

# Response Style
- Answer directly first. Be clear, specific, and non-redundant.
- Match depth to the task: stay brief for simple questions; explain from first principles when teaching, debugging, comparing options, or recommending a path.
- Treat user claims as hypotheses, not facts. Evaluate them against the available context before agreeing, and challenge weak assumptions directly but respectfully.
- State assumptions, uncertainty, and tradeoffs when they matter. Use examples, steps, or comparisons only when they make the answer easier to act on.
- Do not open with praise, flattery, or generic validation such as 'You're absolutely right', 'Great question', or 'Good catch'. Avoid filler, repeated restatements, and unnecessary summary sections.

# Output Format
- Format final answers as GitHub-flavored Markdown. Use concise headings, lists, blockquotes, links, tables, task lists, strikethrough, and fenced code blocks with language tags when they improve clarity.
- When a diagram communicates structure more clearly than prose, use a fenced \`mermaid\` block for a small flowchart, sequence diagram, state diagram, class diagram, or entity-relationship diagram. Keep it focused to about 10 nodes, use short plain-text labels, minimize crossing or backward edges and subgraphs, and split complex systems into multiple diagrams.
- Let the app control Mermaid presentation: do not add frontmatter or init directives, custom styles or colors, embedded HTML, links, images, or other external resources. Include a concise \`accTitle\` and \`accDescr\` describing the diagram.
- When writing Markdown with math, use \`$...$\` for inline math and \`$$...$$\` on separate lines for block math. Escape literal currency dollar signs as \`\\$\` so they are not parsed as inline math.

# Memory
- Use memory only for durable preferences, workspace goals, thread goals, and decisions. Do not store transient requests, secrets, full documents, item bodies, or actual workspace state.`;

export async function callModel(modelId, userPrompt, systemPrompt = FULL_SOUL_PROMPT) {
	const res = await fetch(ENDPOINT, {
		method: "POST",
		headers: HEADERS,
		body: JSON.stringify({ modelId, systemPrompt, userPrompt }),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
	const raw = await res.json();
	// Re-analyze locally so field names are consistent with our lib.
	return { ...raw, analysis: analyze(raw.text) };
}

export function analyze(text) {
	const escapedInline = (text.match(/\\\([\s\S]+?\\\)/g) ?? []).length;
	const escapedBlock = (text.match(/\\\[[\s\S]+?\\\]/g) ?? []).length;
	const doubleDollarBlocks = (text.match(/\$\$[\s\S]+?\$\$/g) ?? []).length;
	const withoutDoubles = text.replace(/\$\$[\s\S]+?\$\$/g, "");
	const singleDollarPairs = (withoutDoubles.match(/\$[^$\n]+?\$/g) ?? []).length;
	const fencedMath = (text.match(/```math\s+[\s\S]+?```/g) ?? []).length;
	const unicodeMath = (text.match(/[×÷≠≤≥∈∉∀∃∑∏∫√∞∂∇]/g) ?? []).length;
	// Currency detection ONLY outside math regions. Strip $$...$$ and $...$ first.
	let stripped = text.replace(/\$\$[\s\S]+?\$\$/g, "");
	stripped = stripped.replace(/(?<!\\)\$[^$\n]+?(?<!\\)\$/g, "");
	const rawCurrency = (stripped.match(/(?<!\\)\$\d/g) ?? []).length;
	const escapedCurrency = (text.match(/\\\$\d/g) ?? []).length;
	return {
		backslashInline: escapedInline,
		backslashBlock: escapedBlock,
		singleDollar: singleDollarPairs,
		doubleDollar: doubleDollarBlocks,
		fencedMath,
		unicodeMath,
		rawCurrency,
		escapedCurrency,
	};
}

// Normalizer under evaluation. String-level, skips fenced code blocks.
export function normalize(text) {
	const parts = text.split(/(```[\s\S]*?```)/g);
	return parts
		.map((part, i) => {
			if (i % 2 === 1) return part; // fenced code, untouched
			return part
				.replace(/\\\[([\s\S]+?)\\\]/g, (_, tex) => `$$${tex}$$`)
				.replace(/\\\(([\s\S]+?)\\\)/g, (_, tex) => `$${tex}$`);
		})
		.join("");
}

export async function saveRun(filename, data) {
	const path = join(RUNS_DIR, filename);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, JSON.stringify(data, null, 2));
}

export function fmtDialects(a) {
	const parts = [];
	if (a.backslashInline + a.backslashBlock > 0) parts.push(`backslash(${a.backslashInline + a.backslashBlock})`);
	if (a.singleDollar > 0) parts.push(`$(${a.singleDollar})`);
	if (a.doubleDollar > 0) parts.push(`$$(${a.doubleDollar})`);
	if (a.fencedMath > 0) parts.push(`\`\`\`math(${a.fencedMath})`);
	if (a.unicodeMath > 0) parts.push(`unicode(${a.unicodeMath})`);
	return parts.length ? parts.join("+") : "none";
}
