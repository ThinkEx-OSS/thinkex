import {
	firecrawlJsonRequest,
	getBooleanValue,
	getNumberValue,
	getRecordArrayValue,
	getRecordValue,
	getStringValue,
	truncateFirecrawlText,
} from "#/integrations/firecrawl/client";

const MAX_RESEARCH_TEXT_CHARS = 4_000;

export async function discoverResearch(input: {
	env: Cloudflare.Env;
	query: string;
	limit: number;
	includeGithub: boolean;
}) {
	const [papers, github] = await Promise.all([
		searchResearchPapers(input),
		input.includeGithub ? searchResearchGithub(input) : Promise.resolve([]),
	]);

	return {
		papers,
		github,
	};
}

export async function deepenResearchWithPassages(input: {
	env: Cloudflare.Env;
	paperId: string;
	question: string;
	limit: number;
}) {
	const response = await firecrawlJsonRequest({
		env: input.env,
		path: `/v2/search/research/papers/${encodeURIComponent(input.paperId)}?${new URLSearchParams({
			query: input.question,
			k: String(input.limit),
		})}`,
		operation: "Research passages",
	});

	return {
		paper: normalizePaperSummary(getRecordValue(response, "paper")),
		passages: normalizePassages(response),
	};
}

export async function deepenResearchWithRelated(input: {
	env: Cloudflare.Env;
	paperId: string;
	relation: "similar" | "citers" | "references";
	intent: string;
	limit: number;
}) {
	const [paperResponse, relatedResponse] = await Promise.all([
		firecrawlJsonRequest({
			env: input.env,
			path: `/v2/search/research/papers/${encodeURIComponent(input.paperId)}`,
			operation: "Research paper lookup",
		}),
		firecrawlJsonRequest({
			env: input.env,
			path: `/v2/search/research/papers/${encodeURIComponent(input.paperId)}/similar?${new URLSearchParams(
				{
					intent: input.intent,
					mode: input.relation,
					k: String(input.limit),
				},
			)}`,
			operation: "Research related papers",
		}),
	]);

	return {
		paper: normalizePaperSummary(getRecordValue(paperResponse, "paper")),
		relation: input.relation,
		papers: getRecordArrayValue(relatedResponse, "results")
			.map((item) => normalizePaperSummary(item))
			.filter((item) => item.paper_id || item.title),
		truncated: getBooleanValue(relatedResponse, "truncated") ?? false,
		pool_size: getNumberValue(relatedResponse, "poolSize"),
	};
}

async function searchResearchPapers(input: { env: Cloudflare.Env; query: string; limit: number }) {
	const response = await firecrawlJsonRequest({
		env: input.env,
		path: `/v2/search/research/papers?${new URLSearchParams({
			query: input.query,
			k: String(input.limit),
		})}`,
		operation: "Research discovery",
	});

	return getRecordArrayValue(response, "results")
		.map((item) => normalizePaperSummary(item, { includeAbstract: true, includeScore: true }))
		.filter((item) => item.paper_id || item.title);
}

async function searchResearchGithub(input: { env: Cloudflare.Env; query: string; limit: number }) {
	const response = await firecrawlJsonRequest({
		env: input.env,
		path: `/v2/search/research/github?${new URLSearchParams({
			query: input.query,
			k: String(input.limit),
		})}`,
		operation: "Research implementation discovery",
	});

	return getRecordArrayValue(response, "results")
		.map((item) => ({
			repo: getStringValue(item, "repo"),
			url: getStringValue(item, "url"),
			title: getStringValue(item, "title"),
			snippet: truncateFirecrawlText(
				getStringValue(item, "snippet") ?? getStringValue(item, "contentMd"),
				MAX_RESEARCH_TEXT_CHARS,
			),
		}))
		.filter((item) => item.url || item.title);
}

function normalizePaperSummary(
	value: unknown,
	options?: {
		includeAbstract?: boolean;
		includeScore?: boolean;
	},
) {
	const primaryId = getPrimaryId(value);

	return {
		paper_id: getStringValue(value, "paperId") ?? primaryId,
		primary_id: primaryId,
		title: getStringValue(value, "title"),
		abstract: options?.includeAbstract
			? truncateFirecrawlText(getStringValue(value, "abstract"), MAX_RESEARCH_TEXT_CHARS)
			: undefined,
		score: options?.includeScore ? getNumberValue(value, "score") : undefined,
		url: getPaperUrl(value, primaryId),
	};
}

function normalizePassages(value: unknown) {
	const passages = getRecordArrayValue(value, "passages");
	const results = passages.length > 0 ? passages : getRecordArrayValue(value, "results");

	return results
		.map((item) => ({
			text: truncateFirecrawlText(
				getStringValue(item, "text") ??
					getStringValue(item, "content") ??
					getStringValue(item, "contentMd") ??
					getStringValue(item, "snippet"),
				MAX_RESEARCH_TEXT_CHARS,
			),
			score: getNumberValue(item, "score"),
			section: getStringValue(item, "section"),
		}))
		.filter((item) => item.text);
}

function getPrimaryId(value: unknown) {
	const directPrimaryId = getStringValue(value, "primaryId");

	if (directPrimaryId) {
		return directPrimaryId;
	}

	const ids = getRecordValue(value, "ids");
	const arxivIds = getRecordArrayValue(ids, "arxiv");
	const firstArxivId = arxivIds.find((item): item is string => typeof item === "string");

	return firstArxivId ? `arxiv:${firstArxivId}` : null;
}

function getPaperUrl(value: unknown, primaryId: string | null) {
	const directUrl = getStringValue(value, "url");

	if (directUrl) {
		return directUrl;
	}

	if (primaryId?.startsWith("arxiv:")) {
		return `https://arxiv.org/abs/${primaryId.slice("arxiv:".length)}`;
	}

	return null;
}
