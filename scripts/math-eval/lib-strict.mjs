// Strict LLM-math markdown normalizer.
//
// Preprocessor that runs on the raw accumulated text before remark-math parses,
// combining the community-canonical delimiter rewrites (from Assistant-UI's
// @assistant-ui/react-markdown preprocess.ts, MIT-licensed) with fenced- and
// inline-code protection, and running currency escape FIRST so any $-generating
// rewrites do not self-escape.
//
// Streaming safety: transforms are idempotent and non-greedy so mid-stream
// partial delimiters (like a `\(x` without the closing `\)`) pass through
// unchanged; when the closing arrives the whole pair is rewritten atomically.

// ── Delimiter patterns ───────────────────────────────────────────────────

// Inline bracket math: \(x\) or \\(x\\) (JSON-double-escaped from tool outputs).
// Single-line only — remark-math treats inline math the same way.
const BRACKET_INLINE = /\\{1,2}\(([^\n]+?)\\{1,2}\)/g;

// Display bracket math: \[…\] or \\[…\\]. May span lines (matrices, aligned envs).
const BRACKET_DISPLAY = /\\{1,2}\[([\s\S]+?)\\{1,2}\]/g;

// Some fine-tunes emit these instead of $-delimiters.
const CUSTOM_MATH_TAG = /\[\/math\]([\s\S]*?)\[\/math\]/g;
const CUSTOM_INLINE_TAG = /\[\/inline\]([\s\S]*?)\[\/inline\]/g;

// Currency escape: an unescaped $ immediately followed by a digit is currency.
// (^|[^\\$]) — first char must be start OR a char that is not \ (so we skip
// already-escaped \$) and not $ (so we skip the second $ of a $$ display pair).
// ((?:\\\\)*) — preserve any even run of backslashes before the $.
// (?=\d) — lookahead for a digit; a math expression virtually never opens with one.
const CURRENCY_DOLLAR = /(^|[^\\$])((?:\\\\)*)\$(?=\d)/g;

// ── Code protection ─────────────────────────────────────────────────────

// Placeholder marker no realistic LLM output contains. Space-prefixed to keep
// markdown structural characters away.
const TOKEN = " MDMN";

function stowCodeRuns(text) {
	const preserved = [];
	// Fenced code (triple backticks) — may span lines.
	let s = text.replace(/```[\s\S]*?```/g, (match) => {
		preserved.push(match);
		return `${TOKEN}${preserved.length - 1} `;
	});
	// Inline code (single or multi-backtick, same line per CommonMark).
	s = s.replace(/(`+)[^`\n]+?\1/g, (match) => {
		preserved.push(match);
		return `${TOKEN}${preserved.length - 1} `;
	});
	return { stripped: s, preserved };
}

function restoreCodeRuns(text, preserved) {
	return text.replace(/ MDMN(\d+) /g, (_, i) => preserved[Number(i)] ?? "");
}

// ── Public API ──────────────────────────────────────────────────────────

// Rewrite alternative delimiter dialects that models occasionally emit
// (LaTeX brackets, custom tags) into the $ / $$ form remark-math parses.
export function rewriteAlternativeDelimiters(text) {
	return text
		.replace(BRACKET_INLINE, (_, body) => `$${body.trim()}$`)
		.replace(BRACKET_DISPLAY, (_, body) => `$$${body.trim()}$$`)
		.replace(CUSTOM_MATH_TAG, (_, body) => `$$${body.trim()}$$`)
		.replace(CUSTOM_INLINE_TAG, (_, body) => `$${body.trim()}$`);
}

// Decide whether the body between two adjacent `$` marks looks like a real
// math expression the model intended (algebra, LaTeX macros, or a bare
// numeric like `6` used inline). Everything else is treated as currency
// prose. Runs O(body) with no lookbehind — Safari-safe.
function bodyLooksLikeMath(body) {
	const t = body.trim();
	if (!t) return false;
	if (t.length > 200) return false; // too long — probably prose ran into next $
	// Markdown structural characters bleeding through mean the $-pair
	// wrapped around formatted prose, not math.
	if (/\*\*|__|~~|\n\n/.test(t)) return false;
	// LaTeX command — definitely math.
	if (/\\[a-zA-Z]/.test(t)) return true;
	// Dangling operator at start or end signals cut-off currency arithmetic
	// ("45 + " came from `$45 + $3.60`, not a complete math expression).
	// Complete math expressions end and start with an operand.
	if (/[+\-−–×÷=/*→←]\s*$/.test(t)) return false;
	if (/^\s*[+\-−–×÷=/*→←]/.test(t)) return false;
	// Currency codes shouldn't count as prose words for this test.
	const withoutCcy = t.replace(/\b(?:USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|k|M|B)\b/gi, "");
	// A word of 3+ letters is prose ("today", "and", "total") — not math.
	if (/[a-zA-Z]{3,}/.test(withoutCcy)) return false;
	// Pure numeric with math operators.
	if (/^[\s\d.,+\-*/=×÷^_(){}[\]<>|:;'"\\]+$/.test(t)) return true;
	// Numeric with 1-2 letter algebraic variables.
	if (/^[\sa-zA-Z\d.,+\-*/=×÷^_(){}[\]<>|:;'"\\]+$/.test(t)) return true;
	return false;
}

// Escape currency-looking dollar signs so single-dollar math does not
// consume them. `$5`, `$1,299`, `$19.99` → `\$5`, `\$1,299`, `\$19.99`.
//
// Two-pass to preserve idempotence: pass 1 finds every currency-suspect
// `$` position via a look-ahead on the ORIGINAL text (so decisions are
// not affected by earlier substitutions in the same run). Pass 2 applies
// escapes right-to-left so positions stay valid.
//
// A `$` is treated as math (kept unescaped) if it opens a same-line pair
// whose body passes `bodyLooksLikeMath`. Otherwise it's escaped as currency.
export function escapeCurrencyDollars(text) {
	const positions = [];
	const re = /(^|[^\\$])((?:\\\\)*)\$(?=\d)/g;
	let m;
	while ((m = re.exec(text)) !== null) {
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
	for (const p of positions) out = out.slice(0, p) + "\\" + out.slice(p);
	return out;
}

// Full pipeline. Currency escape runs first so subsequent bracket rewrites
// (which produce fresh `$…$` pairs) are not themselves misidentified as
// currency. Fenced + inline code content is stowed and restored so LaTeX
// teaching examples and dollar-sign string literals inside code survive.
export function normalizeStrict(text) {
	if (!text || typeof text !== "string") return text;
	const { stripped, preserved } = stowCodeRuns(text);
	const escaped = escapeCurrencyDollars(stripped);
	const rewritten = rewriteAlternativeDelimiters(escaped);
	return restoreCodeRuns(rewritten, preserved);
}

// Aliases kept so older scripts continue to run.
export { normalizeStrict as normalizeMathMarkdown };
export function currencyUnwrapStrict(text) {
	return normalizeStrict(text);
}

// Legacy heuristic used by one validation script; retained but not part of
// the shipping pipeline (pre-parse escape supersedes post-parse unwrap).
export function isSuspectedBrokenCurrency(content) {
	const t = content.trim();
	if (!t) return false;
	if (/\\[a-zA-Z]/.test(t) || /\\\\/.test(t)) return false;
	const strippedCurrency = t.replace(/USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|k|M|B/g, "");
	if (/[a-zA-Z]{3,}/.test(strippedCurrency)) return true;
	if (!/\d/.test(t)) return false;
	if (/[+\-−–×÷=/*→←][\s]*$/.test(t)) return true;
	if (/^[\s]*[+\-−–×÷=/*→←]/.test(t)) return true;
	return false;
}
