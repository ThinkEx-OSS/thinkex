/**
 * True when the body between two `$` marks reads as a real math expression the
 * model intended, rather than money or prose. Both the chat Markdown normalizer
 * and the document HTML parser use it to tell an inline math pair apart from a
 * `$5 and $10` currency pair.
 *
 * | Body                                | Verdict | Reason                        |
 * | ----------------------------------- | ------- | ----------------------------- |
 * | `6`, `5.99`, `1,299`                | math    | bare numeric literal          |
 * | `x^2 + 5x`, `n = 3`                 | math    | algebra with short variables  |
 * | `\frac{a}{b}`, `\sum_{i=1}^n`       | math    | LaTeX macro present           |
 * | `5 total`, `today, or `, `5 and 6`  | prose   | 3+ letter English word        |
 * | `45 + `, `= 60`, `1,299–`           | prose   | dangling operator (cut off)   |
 * | `**bold**`, blank lines, >200 chars | prose   | markdown structural / too long |
 */
export function mathLikeInlineBody(body: string): boolean {
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
