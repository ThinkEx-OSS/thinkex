import { Quote, Search } from "lucide-react";
import { useState } from "react";

import { cn } from "#/lib/utils";

type Paper = {
	id: string;
	title: string;
	venue: string;
	cites: string;
};

type Corpus = {
	id: string;
	name: string;
	/**
	 * Drawn rather than fetched: the real marks are trademarks, and a monogram
	 * identifies the corpus without shipping someone else's logo.
	 */
	monogram: string;
	monogramClassName: string;
	query: string;
	papers: ReadonlyArray<Paper>;
};

/**
 * The four corpora the research index actually covers, per Firecrawl's docs.
 * arXiv leads because the other three are biomedical and the page already
 * opens on a biology screenshot.
 */
const CORPORA: ReadonlyArray<Corpus> = [
	{
		id: "arxiv",
		name: "arXiv",
		monogram: "X",
		monogramClassName: "bg-red-700",
		query: "sea level rise projections",
		papers: [
			{
				id: "a1",
				title: "Revised sea level projections to 2100",
				venue: "arXiv, physics.ao-ph, 2024",
				cites: "142",
			},
			{
				id: "a2",
				title: "Ice sheet contributions to regional sea level",
				venue: "arXiv, physics.ao-ph, 2023",
				cites: "88",
			},
			{
				id: "a3",
				title: "Coastal flood exposure under warming",
				venue: "arXiv, physics.ao-ph, 2022",
				cites: "31",
			},
		],
	},
	{
		id: "pubmed",
		name: "PubMed",
		monogram: "P",
		monogramClassName: "bg-blue-700",
		query: "sleep and memory consolidation",
		papers: [
			{
				id: "p1",
				title: "Slow wave sleep and overnight retention",
				venue: "Nature Neuroscience, 2024",
				cites: "310",
			},
			{
				id: "p2",
				title: "Targeted memory reactivation during naps",
				venue: "Journal of Neuroscience, 2023",
				cites: "127",
			},
			{ id: "p3", title: "Sleep loss and next-day recall", venue: "Sleep, 2022", cites: "64" },
		],
	},
	{
		id: "biorxiv",
		name: "bioRxiv",
		monogram: "b",
		monogramClassName: "bg-orange-600",
		query: "crispr off-target effects",
		papers: [
			{
				id: "b1",
				title: "Off-target profiling of base editors",
				venue: "bioRxiv preprint, 2025",
				cites: "96",
			},
			{
				id: "b2",
				title: "Guide RNA rules for fewer off-targets",
				venue: "bioRxiv preprint, 2024",
				cites: "58",
			},
			{
				id: "b3",
				title: "Comparing assays across cell types",
				venue: "bioRxiv preprint, 2024",
				cites: "22",
			},
		],
	},
	{
		id: "medrxiv",
		name: "medRxiv",
		monogram: "m",
		monogramClassName: "bg-teal-700",
		query: "long covid cognitive outcomes",
		papers: [
			{
				id: "m1",
				title: "Cognitive outcomes at 24 months",
				venue: "medRxiv preprint, 2025",
				cites: "204",
			},
			{
				id: "m2",
				title: "Processing speed in recovered adults",
				venue: "medRxiv preprint, 2024",
				cites: "77",
			},
			{
				id: "m3",
				title: "Cohort analysis of persistent symptoms",
				venue: "medRxiv preprint, 2024",
				cites: "41",
			},
		],
	},
];

/**
 * Paper search shown corpora first, because which literature is indexed is the
 * reason to care. Picking one swaps the query and the hits beneath it.
 */
export function ResearchVisual() {
	const [activeId, setActiveId] = useState<Corpus["id"]>(CORPORA[0].id);
	const active = CORPORA.find((corpus) => corpus.id === activeId) ?? CORPORA[0];

	return (
		<div className="flex w-full flex-col gap-2.5">
			<div className="flex flex-wrap gap-1.5">
				{CORPORA.map((corpus) => {
					const isActive = corpus.id === active.id;

					return (
						<button
							key={corpus.id}
							type="button"
							aria-pressed={isActive}
							onClick={() => setActiveId(corpus.id)}
							onMouseEnter={() => setActiveId(corpus.id)}
							className={cn(
								"cursor-pointer flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
								isActive
									? "border-foreground/25 bg-muted text-foreground"
									: "border-border/70 text-muted-foreground hover:bg-muted/50",
							)}
						>
							<span
								className={cn(
									"grid size-4 shrink-0 place-items-center rounded-[3px] text-[0.55rem] font-bold text-white",
									corpus.monogramClassName,
								)}
								aria-hidden="true"
							>
								{corpus.monogram}
							</span>
							{corpus.name}
						</button>
					);
				})}
			</div>
			<div className="flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 dark:bg-white/[0.02]">
				<Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span className="truncate text-sm">{active.query}</span>
			</div>
			{/* Results are plain rows, not bordered cards: boxed like the search field
			    above them, the two read as the same kind of thing. */}
			<div className="grid divide-y divide-border/50">
				{active.papers.map((paper) => (
					<div key={paper.id} className="flex min-w-0 items-center gap-2.5 px-1 py-2">
						<div className="min-w-0 flex-1">
							<p className="truncate text-sm leading-5 font-medium">{paper.title}</p>
							<div className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
								<span className="truncate">{paper.venue}</span>
								<span className="flex shrink-0 items-center gap-1">
									<Quote className="size-3" aria-hidden="true" />
									{paper.cites}
								</span>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
