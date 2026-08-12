/**
 * In-memory name search for palettes and pickers.
 *
 * Compact form follows VS Code `prepareQuery` (spaces and punctuation do not
 * have to appear in the target). Spaces are AND-tokens like fzf. Ranking tiers
 * follow match-sorter: equal > prefix > contains > acronym > subsequence.
 *
 * The first field is the primary name (weight 1). Later string fields are
 * aliases (weight 0.6). Pass `{ text, weight }` to override.
 */

const equalRank = 7;
const prefixRank = 6;
const containsRank = 4;
const acronymRank = 3;
const fuzzyRank = 1;
const aliasWeight = 0.6;

export type NameSearchField = string | { text: string; weight?: number };

interface PreparedName {
	acronym: string;
	compact: string;
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
		best = Math.max(best, rankString(haystack.compact, needle.compact) * weight);
	}

	let tokenTotal = 0;
	for (const token of needle.tokens) {
		let tokenBest = 0;
		for (const { haystack, weight } of haystacks) {
			tokenBest = Math.max(tokenBest, scoreToken(haystack, token) * weight);
		}
		if (tokenBest === 0) {
			return best;
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
	let best = rankString(haystack.compact, token);
	for (const hayToken of haystack.tokens) {
		best = Math.max(best, rankString(hayToken, token));
	}
	if (token.length >= 2 && haystack.acronym.startsWith(token)) {
		best = Math.max(best, acronymRank);
	}
	return best;
}

function rankString(haystack: string, needle: string) {
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
	return rankSubsequence(haystack, needle);
}

function rankSubsequence(haystack: string, needle: string) {
	let from = 0;
	const first = haystack.indexOf(needle[0]!);
	if (first === -1) {
		return 0;
	}
	from = first + 1;
	for (let index = 1; index < needle.length; index += 1) {
		const at = haystack.indexOf(needle[index]!, from);
		if (at === -1) {
			return 0;
		}
		from = at + 1;
	}
	return fuzzyRank + needle.length / (from - first);
}

function prepareName(value: string): PreparedName {
	const tokens =
		foldName(value.replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")).match(/[\p{L}\p{N}]+/gu) ?? [];
	return {
		acronym: tokens.map((token) => token[0]).join(""),
		compact: tokens.join(""),
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
