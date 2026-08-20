import { BookOpen, Search } from "lucide-react";
import { useState } from "react";

import { cn } from "#/lib/utils";

import { SourceThumbnail, type SourceThumbnailKind } from "./SourceThumbnail";

type Citation = {
	id: string;
	kind: SourceThumbnailKind;
	label: string;
	locator: string;
	passage: string;
};

const CITATIONS = [
	{
		id: "1",
		kind: "book",
		label: "World History, Vol. 2",
		locator: "page 312",
		passage: "Congress approved the program in April 1948, covering sixteen countries.",
	},
	{
		id: "2",
		kind: "paper",
		label: "The Marshall Plan",
		locator: "page 12",
		passage: "Industrial output passed prewar levels by 1951.",
	},
	{
		id: "3",
		kind: "lecture",
		label: "Lecture 9: The Cold War",
		locator: "18:20",
		passage: "The Soviet Union declined, and pressed its sphere to decline as well.",
	},
] as const satisfies ReadonlyArray<Citation>;

/**
 * The evidence is on screen from the start rather than hidden behind a click,
 * because "you can check it" is the claim and a closed panel does not make it.
 * Clicking a different marker swaps which source is shown.
 */
export function CitedAnswerVisual() {
	const [activeId, setActiveId] = useState<Citation["id"]>(CITATIONS[0].id);
	const active = CITATIONS.find((citation) => citation.id === activeId) ?? CITATIONS[0];

	return (
		<div className="flex min-h-52 w-full flex-col justify-center gap-3 text-sm">
			{/* The question, so the reply below has something to be a reply to. */}
			<p className="ml-auto max-w-[85%] rounded-2xl rounded-br-none bg-blue-600 px-3 py-2 leading-5 text-white">
				What did the Marshall Plan actually do?
			</p>
			{/* A bubble with a tail, so it reads as something the assistant said. The
			    tail is a rotated square tucked under the squared-off bottom-left
			    corner, sharing the bubble's fill and two of its borders. */}
			<div className="relative rounded-2xl rounded-bl-none border border-border/70 bg-muted/40 p-3.5">
				<span
					aria-hidden="true"
					className="absolute bottom-0 -left-[7px] size-3.5 rotate-45 rounded-[2px] border-border/70 border-b border-l bg-muted/40"
				/>
				{/* What it did before answering, because "grounded" is a claim about
			    process and this is the only place the process is visible. */}
				<div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
					<span className="flex items-center gap-1.5">
						<BookOpen className="size-3.5 shrink-0" aria-hidden="true" />
						Read 4 sources
					</span>
					<span className="flex items-center gap-1.5">
						<Search className="size-3.5 shrink-0" aria-hidden="true" />
						Searched 12 papers
					</span>
				</div>
				<p className="leading-6 text-foreground/85">
					The Marshall Plan began in 1948
					<CitationMarker citation={CITATIONS[0]} activeId={activeId} onSelect={setActiveId} />, and
					recovery was well underway by 1951
					<CitationMarker citation={CITATIONS[1]} activeId={activeId} onSelect={setActiveId} />,
					though it also deepened the divide with the Soviet bloc
					<CitationMarker citation={CITATIONS[2]} activeId={activeId} onSelect={setActiveId} />.
				</p>
			</div>
			<div className="flex min-w-0 gap-3 rounded-md border border-border/70 bg-muted/25 p-3">
				<SourceThumbnail kind={active.kind} className="h-14 w-11 shrink-0" />
				<div className="min-w-0">
					<div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
						<span className="truncate font-medium text-foreground">{active.label}</span>
						<span className="shrink-0 text-muted-foreground">{active.locator}</span>
					</div>
					<p className="mt-1.5 line-clamp-3 border-blue-600/40 border-l-2 pl-2.5 text-[0.8rem] leading-5 text-muted-foreground">
						{active.passage}
					</p>
				</div>
			</div>
		</div>
	);
}

function CitationMarker({
	activeId,
	citation,
	onSelect,
}: {
	activeId: Citation["id"];
	citation: Citation;
	onSelect: (id: string) => void;
}) {
	const isActive = citation.id === activeId;

	return (
		<button
			type="button"
			onClick={() => onSelect(citation.id)}
			onMouseEnter={() => onSelect(citation.id)}
			className={cn(
				"cursor-pointer mx-0.5 inline-flex size-4.5 -translate-y-0.5 items-center justify-center rounded-[5px] border align-middle text-[0.68rem] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
				isActive
					? "border-blue-600 bg-blue-600 text-white"
					: "border-border bg-muted/70 text-muted-foreground",
			)}
			aria-label={`Show the passage from ${citation.label}`}
		>
			{citation.id}
		</button>
	);
}
