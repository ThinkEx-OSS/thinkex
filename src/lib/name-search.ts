/**
 * In-memory name search for palettes and pickers.
 *
 * Prepare like VS Code `prepareQuery`: `To Do` / `to-do` / `todo` share a
 * compact form, camelCase splits into words, Unicode is NFKD-folded.
 * Rank like match-sorter: equal > prefix > contains > acronym > subsequence.
 * A later-word equal is demoted to prefix so "foo" still beats "foo bar".
 * Spaces are AND-tokens (fzf, VS Code `scoreItemFuzzy`).
 *
 * Fuzzy subsequence must start on a word, and a gap past 8 characters is
 * not a match (fzf cancels its word-boundary bonus at that distance).
 * Name palettes (Spotlight, Linear, Notion) do not show mid-word letter soup;
 * this gate is that product rule, not a file-finder ranker.
 *
 * The first field is the name (weight 1). Later string fields are aliases
 * (0.6): an exact alias cannot outrank a name prefix (7 * 0.6 < 6).
 */

const equalRank = 7;
const prefixRank = 6;
const containsRank = 4;
const acronymRank = 3;
const fuzzyRank = 1;
const aliasWeight = 0.6;
/** fzf: word-boundary bonus is cancelled once a gap grows past 8 characters. */
const maxFuzzyGap = 8;
const tokenStart = [0];

export type NameSearchField = string | { text: string; weight?: number };

interface PreparedName {
	acronym: string;
	compact: string;
	starts: number[];
	tokens: string[];
}

export function hasNameSearchQuery(query: string) {
	return prepareName(query).compact.length > 0;
}

export function scoreNameSearch(query: string, fields: readonly NameSearchField[]): number {
	const needle = prepareName(query);
	if (needle.compact.length === 0) {
		return 0;
	}

	const haystacks = fields.flatMap((field, index) => {
		const { text, weight } = resolveField(field, index);
		const haystack = prepareName(text);
		return haystack.compact.length > 0 ? [{ haystack, weight }] : [];
	});
	if (haystacks.length === 0) {
		return 0;
	}

	let best = 0;
	for (const { haystack, weight } of haystacks) {
		best = Math.max(best, rankString(haystack.compact, needle.compact, haystack.starts) * weight);
	}

	let tokenTotal = 0;
	for (const token of needle.tokens) {
		let tokenBest = 0;
		for (const { haystack, weight } of haystacks) {
			tokenBest = Math.max(tokenBest, scoreToken(haystack, token) * weight);
		}
		if (tokenBest === 0) {
			return 0;
		}
		tokenTotal += tokenBest;
	}

	return Math.max(best, tokenTotal / needle.tokens.length);
}

export function rankNameSearch<T>(
	query: string,
	items: readonly T[],
	fieldsOf: (item: T) => readonly NameSearchField[],
): T[] {
	if (!hasNameSearchQuery(query)) {
		return items as T[];
	}

	return items
		.map((item, index) => ({
			index,
			item,
			score: scoreNameSearch(query, fieldsOf(item)),
		}))
		.filter((entry) => entry.score > 0)
		.sort((left, right) => right.score - left.score || left.index - right.index)
		.map((entry) => entry.item);
}

function scoreToken(haystack: PreparedName, token: string) {
	let best = rankString(haystack.compact, token, haystack.starts);
	for (const hayToken of haystack.tokens) {
		const rank = rankString(hayToken, token, tokenStart);
		best = Math.max(best, rank === equalRank ? prefixRank : rank);
	}
	if (token.length >= 2 && haystack.acronym.startsWith(token)) {
		best = Math.max(best, acronymRank);
	}
	return best;
}

function rankString(haystack: string, needle: string, wordStarts: readonly number[]) {
	if (needle.length === 0 || needle.length > haystack.length) {
		return 0;
	}
	if (haystack === needle) {
		return equalRank;
	}
	if (haystack.startsWith(needle)) {
		return prefixRank;
	}
	if (haystack.includes(needle)) {
		return containsRank;
	}
	return rankSubsequence(haystack, needle, wordStarts);
}

function rankSubsequence(haystack: string, needle: string, wordStarts: readonly number[]) {
	let best = 0;
	for (const first of wordStarts) {
		if (haystack[first] !== needle[0]) {
			continue;
		}
		best = Math.max(best, scoreSubsequenceFrom(haystack, needle, first));
	}
	return best;
}

function scoreSubsequenceFrom(haystack: string, needle: string, first: number) {
	let from = first + 1;
	for (let index = 1; index < needle.length; index += 1) {
		const at = haystack.indexOf(needle[index]!, from);
		if (at === -1 || at - from > maxFuzzyGap) {
			return 0;
		}
		from = at + 1;
	}

	return fuzzyRank + needle.length / (from - first);
}

function prepareName(value: string): PreparedName {
	const tokens =
		foldName(value.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")).match(/[\p{L}\p{N}]+/gu) ?? [];
	const starts: number[] = [];
	let offset = 0;
	for (const token of tokens) {
		starts.push(offset);
		offset += token.length;
	}

	return {
		acronym: tokens.map((token) => token[0]).join(""),
		compact: tokens.join(""),
		starts,
		tokens,
	};
}

function foldName(value: string) {
	return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
}

function resolveField(field: NameSearchField, index: number) {
	if (typeof field === "string") {
		return { text: field, weight: index === 0 ? 1 : aliasWeight };
	}

	return { text: field.text, weight: field.weight ?? (index === 0 ? 1 : aliasWeight) };
}
