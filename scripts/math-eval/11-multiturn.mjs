#!/usr/bin/env node
// Does a chosen delimiter dialect (dollar vs backslash) stick across turns?
// Set up 3-turn conversations and see whether GPT-mini locks in a dialect
// after turn 1 or flips between turns.
import { analyze, ENDPOINT, FULL_SOUL_PROMPT, HEADERS, saveRun } from "./lib.mjs";

const MODEL = "chatgpt-mini";

const CONVERSATIONS = [
	{
		id: "escalating-math",
		turns: [
			"quick refresher: what's the pythagorean theorem",
			"ok now can you prove it",
			"can you also show me the general form for n-dimensional euclidean distance",
		],
	},
	{
		id: "math-then-currency",
		turns: [
			"prove that 1+2+...+n = n(n+1)/2",
			"cool. unrelated: if i earn $5000 a month and save 20%, how much per month is that",
			"and how much after 3 years",
		],
	},
	{
		id: "currency-then-math",
		turns: [
			"if i earn $5000 a month and save 20%, how much per month is that",
			"unrelated switch — help me solve x^2 - 4 = 0",
			"and what about x^3 - 8 = 0",
		],
	},
	{
		id: "code-then-math",
		turns: [
			"write a python function to compute compound interest",
			"now show me the formula it implements mathematically",
			"can you generalize it to continuous compounding",
		],
	},
];

async function callWithMessages(messages) {
	const res = await fetch(ENDPOINT, {
		method: "POST",
		headers: HEADERS,
		body: JSON.stringify({ modelId: MODEL, systemPrompt: FULL_SOUL_PROMPT, messages }),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
	const raw = await res.json();
	return { ...raw, analysis: analyze(raw.text) };
}

function dialectLabel(a) {
	const bs = a.backslashInline + a.backslashBlock > 0;
	const dol = a.singleDollar + a.doubleDollar > 0;
	if (bs && dol) return "MIXED";
	if (bs) return "backslash";
	if (dol) return "dollar";
	return "none";
}

async function main() {
	console.log(`\nMulti-turn dialect stability — ${MODEL} × ${CONVERSATIONS.length} conversations × 3 turns\n`);
	for (const convo of CONVERSATIONS) {
		console.log(`▓ ${convo.id}`);
		const messages = [];
		const dialects = [];
		for (let i = 0; i < convo.turns.length; i++) {
			const turn = convo.turns[i];
			messages.push({ role: "user", content: turn });
			try {
				const { text, analysis } = await callWithMessages(messages);
				await saveRun(`multiturn/${convo.id}/turn-${i}.json`, {
					conversation: convo.id,
					turn: i,
					messages: [...messages],
					text,
					analysis,
				});
				messages.push({ role: "assistant", content: text });
				const d = dialectLabel(analysis);
				dialects.push(d);
				const bs = analysis.backslashInline + analysis.backslashBlock;
				const flag = bs > 0 ? "✗" : "✓";
				console.log(
					`  turn ${i + 1}  ${flag} "${turn.slice(0, 50)}${turn.length > 50 ? "…" : ""}"  dialect=${d}  bs=${bs}`,
				);
			} catch (e) {
				console.log(`  turn ${i + 1}  ? err: ${e.message.slice(0, 60)}`);
				dialects.push("ERR");
			}
		}
		const stickiness = dialects.every((d) => d === dialects[0] || d === "none")
			? "STABLE"
			: "SWITCHED";
		console.log(`  → dialect trajectory: ${dialects.join(" → ")} (${stickiness})\n`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
