// Preprocessor that runs on the accumulated model text before Streamdown's
// remark-math parses it. Two problems get solved together:
//
// 1. Alternative delimiter dialects. OpenAI-family models routinely emit
//    `\(x\)` / `\[x\]` which remark-math ignores, rendering them as literal
//    text. We rewrite them to the `$…$` / `$$…$$` form remark-math parses.
//
// 2. Currency escape misses. `$` followed by a digit that the model didn't
//    escape as `\$` is treated by remark-math with `singleDollarTextMath:
//    true` as an inline math delimiter, which corrupts prices like
//    `$5 and $10`. We escape the currency-signature `$` unless the same-line
//    pair looks like a real math expression.
//
// Fenced code blocks and inline code spans are stashed and restored so
// LaTeX teaching examples inside code and dollar-sign string literals in
// code are never touched.
//
// The delimiter patterns are lifted from Assistant-UI's preprocess helpers
// (MIT-licensed, at packages/react-markdown/src/preprocess.ts). The
// currency inspection is more careful than theirs so `$6$` / `$5.99$`
// numeric inline math is preserved.

import { mathLikeInlineBody } from "#/lib/math-like-text";

// Inline bracket math: \(x\) or \\(x\\) (JSON-double-escaped from tool outputs).
// Single-line only — remark-math treats inline math the same way.
const BRACKET_INLINE = /\\{1,2}\(([^\n]+?)\\{1,2}\)/g;
// Display bracket math: \[…\] or \\[…\\]. May span lines (matrices, aligned envs).
const BRACKET_DISPLAY = /\\{1,2}\[([\s\S]+?)\\{1,2}\]/g;
// Currency-signature: an unescaped `$` followed by something that structurally
// looks like a monetary amount — digits with optional thousands separators, an
// optional decimal, an optional k/M/B suffix, terminated by whitespace, a
// non-word character, or end-of-input. Leading group requires start-of-string
// or a char that is neither `\` (already escaped) nor `$` (part of `$$`).
// No lookbehind — Safari-safe.
const CURRENCY_DOLLAR =
	/(^|[^\\$])((?:\\\\)*)\$(?=\d+(?:,\d{3})*(?:\.\d+)?(?:[KMBkmb])?(?:\s|$|[^a-zA-Z\d]))/g;

// Stow placeholders wrap the index in two Unicode Private Use Area characters
// (U+E000–U+F8FF is reserved by the standard for private use; language models
// do not emit these) so the restore regex cannot collide with real content.
const TOKEN_OPEN = "";
const TOKEN_CLOSE = "";
const RESTORE = /(\d+)/g;

function stowCodeRuns(text: string): { stripped: string; preserved: string[] } {
	const preserved: string[] = [];
	let s = text.replace(/```[\s\S]*?```/g, (match) => {
		preserved.push(match);
		return `${TOKEN_OPEN}${preserved.length - 1}${TOKEN_CLOSE}`;
	});
	s = s.replace(/(`+)[^`\n]+?\1/g, (match) => {
		preserved.push(match);
		return `${TOKEN_OPEN}${preserved.length - 1}${TOKEN_CLOSE}`;
	});
	return { stripped: s, preserved };
}

function restoreCodeRuns(text: string, preserved: string[]): string {
	return text.replace(RESTORE, (_, i: string) => preserved[Number(i)] ?? "");
}

// Rewrite the alternative delimiter dialects some models emit into the
// `$…$` / `$$…$$` form remark-math parses.
export function rewriteAlternativeDelimiters(text: string): string {
	return text
		.replace(BRACKET_INLINE, (_, body: string) => `$${body.trim()}$`)
		.replace(BRACKET_DISPLAY, (_, body: string) => `$$${body.trim()}$$`);
}

// Escape currency-signature `$` so `singleDollarTextMath: true` does not
// consume it as an inline math delimiter. Two-pass: pass 1 collects every
// suspect position using look-ahead against the ORIGINAL text (so decisions
// do not depend on earlier substitutions in the same run); pass 2 applies
// escapes right-to-left so positions stay valid.
export function escapeCurrencyDollars(text: string): string {
	const positions: number[] = [];
	CURRENCY_DOLLAR.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = CURRENCY_DOLLAR.exec(text)) !== null) {
		const dollarPos = m.index + m[1].length + m[2].length;
		const rest = text.slice(dollarPos + 1);
		const eol = rest.indexOf("\n");
		const scan = eol === -1 ? rest : rest.slice(0, eol);
		let closeIdx = -1;
		for (let i = 0; i < scan.length; i++) {
			if (scan[i] === "$" && (i === 0 || scan[i - 1] !== "\\")) {
				closeIdx = i;
				break;
			}
		}
		if (closeIdx !== -1 && mathLikeInlineBody(scan.slice(0, closeIdx))) continue;
		positions.push(dollarPos);
	}
	if (positions.length === 0) return text;
	positions.sort((a, b) => b - a);
	let out = text;
	for (const p of positions) out = `${out.slice(0, p)}\\${out.slice(p)}`;
	return out;
}

// Full pipeline. Currency escape runs first so any `$…$` pairs subsequently
// created by the delimiter rewrites are not themselves misidentified as
// currency. Fenced and inline code content is stowed first and restored
// last so LaTeX teaching examples inside code survive unchanged.
export function normalizeLlmMarkdown(text: string): string {
	if (!text) return text;
	const { stripped, preserved } = stowCodeRuns(text);
	const escaped = escapeCurrencyDollars(stripped);
	const rewritten = rewriteAlternativeDelimiters(escaped);
	return restoreCodeRuns(rewritten, preserved);
}
