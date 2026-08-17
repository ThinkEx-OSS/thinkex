import { and, eq, inArray, sql } from "drizzle-orm";

import {
	WORKSPACE_SEARCH_CONFIG,
	workspaceItemContents,
	workspaceItemExtractions,
	workspaceItemPages,
	workspaceItems,
} from "#/db/schema";
import { withDb } from "#/db/server";
import type { WorkspaceItem } from "#/features/workspaces/contracts";
import { buildWorkspaceItemPathIndex } from "#/features/workspaces/model/workspace-paths";
import { getActiveWorkspaceItems } from "#/features/workspaces/persistence/workspace-postgres-support";

/**
 * Hits returned. There is no paging: with a workspace of a few hundred items,
 * the model's lever on a broad query is better wording, not another page. The
 * result reports the true match count so it knows when it is seeing a slice.
 */
const MAX_HITS = 20;
/** Hits kept per item, so one long file cannot crowd out every other match. */
const MAX_HITS_PER_ITEM = 3;
/**
 * Hits scoring below this share of the best hit are dropped. Relative rather
 * than absolute, so it needs no tuning against ts_rank_cd's open-ended scale.
 * An agent acts on whatever it is handed, so a weak tail is worse than a short
 * list.
 */
const RELATIVE_RANK_FLOOR = 0.15;

interface WorkspaceContentHit {
	itemId: string;
	pageNumber: number | null;
	snippet: string;
}

interface WorkspaceUnsearchableFile {
	itemId: string;
	reason: "extracting" | "extraction_failed";
}

interface WorkspaceSearchQueryResult {
	contentHits: WorkspaceContentHit[];
	/** Every item in the workspace, for name matching and path rendering. */
	items: WorkspaceItem[];
	pathsByItemId: Map<string, string>;
	totalHits: number;
	unsearchable: WorkspaceUnsearchableFile[];
}

/**
 * Ranked content search over each item's prose projection and, for files, each
 * extracted page. Patterns are OR-ed into a single tsquery, so several
 * phrasings of one question cost a single round trip.
 */
export async function searchWorkspaceContent(input: {
	patterns: string[];
	workspaceId: string;
}): Promise<WorkspaceSearchQueryResult> {
	return await withDb(async (db) => {
		const items = await getActiveWorkspaceItems(db, input.workspaceId);
		const pathsByItemId = buildWorkspaceItemPathIndex(items);

		const config = sql.raw(`'${WORKSPACE_SEARCH_CONFIG}'`);
		const tsquery = sql.join(
			input.patterns.map((pattern) => sql`websearch_to_tsquery(${config}, ${pattern})`),
			sql` || `,
		);
		const scope = sql`(select id from ${workspaceItems} where workspace_id = ${input.workspaceId})`;

		// Column names are inline: the schema owns the tables, and quoting every
		// column through sql.identifier buries the query shape.
		const result = await db.execute<{
			item_id: string;
			page_number: number | null;
			snippet: string;
			total_hits: number;
		}>(sql`
			with query as (select ${tsquery} as q),
			hits as (
				select
					page.item_id as item_id,
					page.page_number as page_number,
					page.markdown as body,
					ts_rank_cd(page.search_vector, query.q, 1 | 32) as rank
				from ${workspaceItemPages} as page, query
				where page.item_id in ${scope} and page.search_vector @@ query.q
				union all
				select
					entry.item_id,
					null::int,
					entry.search_text,
					ts_rank_cd(entry.search_vector, query.q, 1 | 32)
				from ${workspaceItemContents} as entry, query
				where entry.item_id in ${scope} and entry.search_vector @@ query.q
			),
			ranked as (
				select
					hits.*,
					row_number() over (partition by item_id order by rank desc, page_number) as per_item,
					max(rank) over () as top_rank
				from hits
			)
			select
				item_id,
				page_number,
				ts_headline(
					${config},
					body,
					(select q from query),
					'MaxFragments=2, MinWords=6, MaxWords=18, StartSel=**, StopSel=**'
				) as snippet,
				(select count(*) from hits)::int as total_hits
			from ranked
			where per_item <= ${MAX_HITS_PER_ITEM} and rank >= top_rank * ${RELATIVE_RANK_FLOOR}
			order by rank desc, item_id, page_number
			limit ${MAX_HITS}
		`);

		// Covered by workspace_item_extractions_status_idx on (workspaceId, status).
		const stalledExtractions = await db
			.select({
				itemId: workspaceItemExtractions.itemId,
				status: workspaceItemExtractions.status,
			})
			.from(workspaceItemExtractions)
			.where(
				and(
					eq(workspaceItemExtractions.workspaceId, input.workspaceId),
					inArray(workspaceItemExtractions.status, ["processing", "failed"]),
				),
			);

		const [first] = result.rows;

		return {
			contentHits: result.rows.map((row) => ({
				itemId: row.item_id,
				pageNumber: row.page_number,
				snippet: row.snippet,
			})),
			items,
			pathsByItemId,
			totalHits: first ? Number(first.total_hits) : 0,
			unsearchable: stalledExtractions.map(({ itemId, status }) => ({
				itemId,
				reason: status === "processing" ? ("extracting" as const) : ("extraction_failed" as const),
			})),
		};
	});
}
