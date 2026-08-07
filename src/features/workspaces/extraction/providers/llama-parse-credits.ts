import type { LlamaParseTier } from "#/features/workspaces/extraction/types";
import { getBooleanValue, getRecordArrayValue } from "#/integrations/llamaparse/client";

// Published per-page rates, at $1.25 per 1,000 credits. The cost optimizer bills the
// pages it downgrades at the cost_effective rate, so a job's real cost is a blend and
// cannot be read off the requested tier alone.
const llamaParseCreditsPerPage: Record<LlamaParseTier, number> = {
	cost_effective: 3,
	agentic: 10,
	agentic_plus: 45,
};

/**
 * Blended credit cost read off the per-page breakdown: pages the optimizer downgraded
 * bill at the cost_effective rate, the rest at the requested tier.
 *
 * This is derived from published rates, not an invoice. LlamaParse v2 has never
 * populated a billed figure on a parse response, and reporting null there understates
 * spend on exactly the runs worth investigating — a wrong-by-a-few-percent number
 * still catches a job that cost ten times what it should.
 */
export function getLlamaParseDerivedCredits(metadata: unknown, tier: LlamaParseTier) {
	const pages = getRecordArrayValue(metadata, "pages");
	if (pages.length === 0) {
		return null;
	}

	return pages.reduce(
		(total, page) =>
			total +
			(getBooleanValue(page, "cost_optimized")
				? llamaParseCreditsPerPage.cost_effective
				: llamaParseCreditsPerPage[tier]),
		0,
	);
}
