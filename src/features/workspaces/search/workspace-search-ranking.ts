export interface WorkspaceSearchRankCandidate {
	chunkId: string;
	itemId: string;
}

const reciprocalRankConstant = 60;
const maximumChunksPerItem = 2;

export function fuseWorkspaceSearchRanks<T extends WorkspaceSearchRankCandidate>(input: {
	keyword: readonly T[];
	limit: number;
	semantic: readonly T[];
}): T[] {
	const ranked = new Map<string, { candidate: T; score: number }>();

	addRankedList(ranked, input.keyword, 1.15);
	addRankedList(ranked, input.semantic, 1);

	const itemCounts = new Map<string, number>();
	const results: T[] = [];
	for (const { candidate } of Array.from(ranked.values()).sort(
		(left, right) => right.score - left.score,
	)) {
		const itemCount = itemCounts.get(candidate.itemId) ?? 0;
		if (itemCount >= maximumChunksPerItem) {
			continue;
		}

		results.push(candidate);
		itemCounts.set(candidate.itemId, itemCount + 1);
		if (results.length === input.limit) {
			break;
		}
	}

	return results;
}

function addRankedList<T extends WorkspaceSearchRankCandidate>(
	ranked: Map<string, { candidate: T; score: number }>,
	candidates: readonly T[],
	weight: number,
) {
	for (const [index, candidate] of candidates.entries()) {
		const score = weight / (reciprocalRankConstant + index + 1);
		const existing = ranked.get(candidate.chunkId);
		if (existing) {
			existing.score += score;
		} else {
			ranked.set(candidate.chunkId, { candidate, score });
		}
	}
}
