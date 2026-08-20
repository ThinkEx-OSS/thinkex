import { SourceThumbnail, type SourceThumbnailKind } from "./SourceThumbnail";

const SOURCES = [
	{ id: "book", kind: "book", title: "World History, Vol. 2", meta: "PDF, 640 pages" },
	{ id: "paper", kind: "paper", title: "The Marshall Plan", meta: "CRS report, 2018" },
	{ id: "lecture", kind: "lecture", title: "Lecture 9: The Cold War", meta: "Recording, 48 min" },
	{ id: "image", kind: "image", title: "ERP poster, 1950", meta: "Image" },
] as const satisfies ReadonlyArray<{
	id: string;
	kind: SourceThumbnailKind;
	title: string;
	meta: string;
}>;

/** The formats a workspace accepts, each shown as the thing it actually is. */
export function SourcesVisual() {
	return (
		<div className="grid min-h-52 w-full grid-cols-2 content-center gap-3">
			{SOURCES.map((source) => (
				<div
					key={source.id}
					className="min-w-0 overflow-hidden rounded-md border border-border/70 bg-background transition-[transform,border-color] duration-150 hover:scale-[1.02] hover:border-border active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:scale-100 dark:bg-white/[0.02]"
				>
					<SourceThumbnail kind={source.kind} className="h-20 w-full rounded-none" />
					<div className="min-w-0 border-border/60 border-t p-2">
						<p className="truncate text-xs font-medium">{source.title}</p>
						<p className="truncate text-[0.7rem] text-muted-foreground">{source.meta}</p>
					</div>
				</div>
			))}
		</div>
	);
}
