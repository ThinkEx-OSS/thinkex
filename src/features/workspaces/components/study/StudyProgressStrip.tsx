import { cn } from "#/lib/utils";

/** Outcome colour for one segment. Each study type maps its own state onto these. */
export type StudyProgressTone = "correct" | "hard" | "missed" | "unseen";

export interface StudyProgressSegment {
	id: string;
	/** Announced for the segment's button, e.g. "Card 3: Got it". */
	label: string;
	tone: StudyProgressTone;
}

/**
 * One tick per item in the current session, coloured by outcome and clickable
 * to jump. Shared by every study viewer so progress reads the same whichever
 * item type you are working through.
 */
export function StudyProgressStrip({
	ariaLabel,
	currentIndex,
	onSelect,
	segments,
}: {
	ariaLabel: string;
	currentIndex: number;
	onSelect: (index: number) => void;
	segments: StudyProgressSegment[];
}) {
	const gap =
		segments.length <= 50 ? 3 : segments.length <= 120 ? 2 : segments.length <= 300 ? 1 : 0;

	return (
		<div
			role="group"
			aria-label={ariaLabel}
			className="mx-auto grid h-4 w-full items-center"
			style={{
				columnGap: gap,
				gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))`,
				maxWidth: `${segments.length * 64}px`,
			}}
		>
			{segments.map((segment, index) => (
				<button
					key={segment.id}
					type="button"
					aria-current={index === currentIndex ? "step" : undefined}
					aria-label={segment.label}
					tabIndex={index === currentIndex ? 0 : -1}
					onClick={() => onSelect(index)}
					className="group flex h-4 min-w-0 cursor-pointer items-center focus-visible:outline-none"
				>
					<span
						aria-hidden="true"
						className={cn(
							"h-1.5 w-full min-w-0 rounded-full bg-border transition-[height,background-color,box-shadow,filter] duration-150 group-hover:h-2.5 group-hover:brightness-125",
							segment.tone === "missed" && "bg-red-500/75",
							segment.tone === "hard" && "bg-amber-500/75",
							segment.tone === "correct" && "bg-emerald-500/75",
							index === currentIndex &&
								"h-2.5 ring-1 ring-foreground/70 ring-offset-1 ring-offset-background",
						)}
					/>
				</button>
			))}
		</div>
	);
}
