import { RotateCw } from "lucide-react";
import { useState } from "react";

import { cn } from "#/lib/utils";

/** A flashcard you can actually flip, which is the whole experience in one card. */
export function FlashcardVisual() {
	const [flipped, setFlipped] = useState(false);

	return (
		// h-full plus flex-1 on the card: the media area is taller than this card
		// needs, and a fixed height would just centre it with dead space above and
		// below rather than filling the space it has been given.
		<div className="flex h-full min-h-52 w-full flex-col items-center justify-center gap-3">
			<button
				type="button"
				onClick={() => setFlipped((value) => !value)}
				className="min-h-36 w-full flex-1 cursor-pointer rounded-lg transition-transform duration-150 active:scale-[0.99] [perspective:1200px] motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				aria-pressed={flipped}
			>
				<div
					className={cn(
						"relative size-full transition-transform duration-500 [transform-style:preserve-3d]",
						flipped && "[transform:rotateY(180deg)]",
					)}
				>
					<CardFace hidden={flipped} className="border-border bg-background dark:bg-black">
						<span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
							Question
						</span>
						<p className="mt-2 text-base leading-6 font-medium">What does a catalyst do?</p>
					</CardFace>
					<CardFace
						hidden={!flipped}
						className="border-violet-500/40 bg-violet-500/8 [transform:rotateY(180deg)]"
					>
						<span className="text-xs font-medium tracking-wide text-violet-700 uppercase dark:text-violet-300">
							Answer
						</span>
						<p className="mt-2 text-base leading-6 font-medium">
							Speeds up a reaction without being used up by it.
						</p>
					</CardFace>
				</div>
			</button>
			<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<RotateCw className="size-3.5" aria-hidden="true" />
				Select the card to flip it
			</span>
		</div>
	);
}

/**
 * backface-visibility only stops a face being painted, so without aria-hidden
 * both faces stay in the accessibility tree and a screen reader reads the
 * question and the answer at once.
 */
function CardFace({
	children,
	className,
	hidden,
}: {
	children: React.ReactNode;
	className?: string;
	hidden: boolean;
}) {
	return (
		<div
			aria-hidden={hidden}
			className={cn(
				"absolute inset-0 flex flex-col justify-center rounded-lg border p-5 text-left [backface-visibility:hidden]",
				className,
			)}
		>
			{children}
		</div>
	);
}
