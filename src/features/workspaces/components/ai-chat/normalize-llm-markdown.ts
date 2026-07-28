// Preprocessor that runs on the accumulated model text before Streamdown's
// remark-math parses it. Two problems get solved together:
//
// 1. Alternative delimiter dialects. OpenAI-family models routinely emit
//    `\(x\)` / `\[x\]` (and rarer `[/math]…[/math]` from some fine-tunes)
//    which remark-math ignores, rendering them as literal text. We rewrite
//    them to the `$…$` / `$$…$$` form remark-math parses.
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

// Inline bracket math: \(x\) or \\(x\\) (JSON-double-escaped from tool outputs).
// Single-line only — remark-math treats inline math the same way.
const BRACKET_INLINE = /\\{1,2}\(([^\n]+?)\\{1,2}\)/g;
// Display bracket math: \[…\] or \\[…\\]. May span lines (matrices, aligned envs).
const BRACKET_DISPLAY = /\\{1,2}\[([\s\S]+?)\\{1,2}\]/g;
// Custom tags a few fine-tunes emit.
const CUSTOM_MATH_TAG = /\[\/math\]([\s\S]*?)\[\/math\]/g;
const CUSTOM_INLINE_TAG = /\[\/inline\]([\s\S]*?)\[\/inline\]/g;
// Currency-signature: an unescaped $ followed by a digit. The leading group
// requires start-of-string or a char that is neither `\` (already escaped)
// nor `$` (part of a $$ display pair). No lookbehind — Safari-safe.
const CURRENCY_DOLLAR = /(^|[^\\$])((?:\\\\)*)\$(?=\d)/g;

// Placeholder marker used while transforms run. Space-padded so it never
// creates or extends structural markdown characters when substituted back.
const TOKEN = " MDMN";
const RESTORE = / MDMN(\d+) /g;

function stowCodeRuns(text: string): { stripped: string; preserved: string[] } {
	const preserved: string[] = [];
	let s = text.replace(/```[\s\S]*?```/g, (match) => {
		preserved.push(match);
		return `${TOKEN}${preserved.length - 1} `;
	});
	s = s.replace(/(`+)[^`\n]+?\1/g, (match) => {
		preserved.push(match);
		return `${TOKEN}${preserved.length - 1} `;
	});
	return { stripped: s, preserved };
}

function restoreCodeRuns(text: string, preserved: string[]): string {
	return text.replace(RESTORE, (_, i: string) => preserved[Number(i)] ?? "");
}

// True when the body between two adjacent `$` marks looks like a real math
// expression the model intended (algebra, LaTeX macros, or a bare numeric
// like `6` used inline). Anything else is treated as currency prose.
function bodyLooksLikeMath(body: string): boolean {
	const t = body.trim();
	if (!t) return false;
	if (t.length > 200) return false;
	// Structural markdown characters bleeding through mean the `$…$` pair
	// wrapped around formatted prose, not math.
	if (/\*\*|__|~~|\n\n/.test(t)) return false;
	// LaTeX command — definitely math.
	if (/\\[a-zA-Z]/.test(t)) return true;
	// Dangling operator at start or end signals cut-off currency arithmetic
	// ("45 + " came from `$45 + $3.60`, not a complete math expression).
	if (/[+\-−–×÷=/*→←]\s*$/.test(t)) return false;
	if (/^\s*[+\-−–×÷=/*→←]/.test(t)) return false;
	// Currency codes should not count as prose words for this test.
	const withoutCcy = t.replace(/\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|k|M|B)\b/gi, "");
	// A word of 3+ letters is prose ("today", "and", "total") — not math.
	if (/[a-zA-Z]{3,}/.test(withoutCcy)) return false;
	// Pure numeric with math operators.
	if (/^[\s\d.,+\-*/=×÷^_(){}[\]<>|:;'"\\]+$/.test(t)) return true;
	// Numeric with 1-2 letter algebraic variables.
	if (/^[\sa-zA-Z\d.,+\-*/=×÷^_(){}[\]<>|:;'"\\]+$/.test(t)) return true;
	return false;
}

// Rewrite the alternative delimiter dialects some models emit into the
// `$…$` / `$$…$$` form remark-math parses.
export function rewriteAlternativeDelimiters(text: string): string {
	return text
		.replace(BRACKET_INLINE, (_, body: string) => `$${body.trim()}$`)
		.replace(BRACKET_DISPLAY, (_, body: string) => `$$${body.trim()}$$`)
		.replace(CUSTOM_MATH_TAG, (_, body: string) => `$$${body.trim()}$$`)
		.replace(CUSTOM_INLINE_TAG, (_, body: string) => `$${body.trim()}$`);
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
		if (closeIdx !== -1 && bodyLooksLikeMath(scan.slice(0, closeIdx))) continue;
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
