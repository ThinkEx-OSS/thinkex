import { Check, X } from "lucide-react";
import { useState } from "react";

import { DemoProgressStrip } from "#/components/landing/InteractiveHeroChrome";
import { Button } from "#/components/ui/button";
import "#/features/workspaces/components/flashcards/flashcard-viewer.css";
import { cn } from "#/lib/utils";

export function FlashcardSurface() {
	const [flipped, setFlipped] = useState(false);
	const [rating, setRating] = useState<"again" | "good" | null>(null);
	const [ratingFeedback, setRatingFeedback] = useState<"again" | "good" | null>(null);
	const segments = Array.from({ length: 12 }, (_, index) => ({
		id: String(index),
		label: `Card ${index + 1}`,
		tone:
			index < 5
				? ("correct" as const)
				: index === 5 && rating
					? rating === "again"
						? ("missed" as const)
						: ("correct" as const)
					: ("unseen" as const),
	}));
	const rateCard = (nextRating: "again" | "good") => {
		setRating(nextRating);
		setRatingFeedback(nextRating);
	};

	return (
		<section className="flex h-full min-h-0 flex-col bg-background px-4 py-5 sm:px-8 sm:py-7">
			<div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4">
				<button
					type="button"
					onClick={() => setFlipped((current) => !current)}
					onAnimationEnd={(event) => {
						if (event.target === event.currentTarget) setRatingFeedback(null);
					}}
					className={cn(
						"workspace-flashcard relative min-h-72 flex-1 cursor-pointer rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
						ratingFeedback && "landing-flashcard-feedback",
						ratingFeedback === "again" && "landing-flashcard-feedback-again",
						ratingFeedback === "good" && "landing-flashcard-feedback-good",
					)}
				>
					<span
						aria-hidden="true"
						className="landing-flashcard-feedback-ring pointer-events-none absolute inset-0 z-10 rounded-2xl"
					/>
					<div
						className={cn(
							"workspace-flashcard-inner transition-transform duration-300",
							flipped && "is-flipped",
						)}
						style={{ transform: `rotateY(${flipped ? 180 : 0}deg)` }}
					>
						<div className="workspace-flashcard-face" aria-hidden={flipped}>
							<span className="absolute top-5 left-5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
								Front
							</span>
							<span className="workspace-flashcard-prose">
								During which phase are duplicated chromosomes pulled to opposite ends of the cell?
							</span>
						</div>
						<div
							className="workspace-flashcard-face workspace-flashcard-back"
							aria-hidden={!flipped}
						>
							<span className="absolute top-5 left-5 text-xs font-medium tracking-wider text-muted-foreground uppercase">
								Back
							</span>
							<span className="workspace-flashcard-prose">Anaphase</span>
						</div>
					</div>
				</button>
				<div className="space-y-3">
					<DemoProgressStrip
						ariaLabel={rating ? "6 reviewed, 6 not reviewed" : "5 got it, 7 not reviewed"}
						currentIndex={5}
						segments={segments}
					/>
					<div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
						<span className="text-xs text-muted-foreground tabular-nums">
							{rating ? 6 : 5} reviewed
						</span>
						<div className="col-start-2 flex items-center gap-1 sm:gap-2">
							<Button
								variant="outline"
								aria-label="Review again"
								aria-pressed={rating === "again"}
								disabled={ratingFeedback !== null}
								className={cn(
									"h-11 gap-2 rounded-xl px-5 text-sm font-medium [&_svg]:size-4.5 sm:h-12 sm:px-6 sm:text-base sm:[&_svg]:size-5",
									"border-red-500/30 text-red-600 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400",
									rating === "again" && "bg-red-500/10",
								)}
								onClick={() => rateCard("again")}
							>
								<X /> No
							</Button>
							<Button
								variant="outline"
								aria-label="Got it"
								aria-pressed={rating === "good"}
								disabled={ratingFeedback !== null}
								className={cn(
									"h-11 gap-2 rounded-xl px-5 text-sm font-medium [&_svg]:size-4.5 sm:h-12 sm:px-6 sm:text-base sm:[&_svg]:size-5",
									"border-emerald-500/30 text-emerald-600 hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-700 dark:text-emerald-400",
									rating === "good" && "bg-emerald-500/10",
								)}
								onClick={() => rateCard("good")}
							>
								<Check /> Yes
							</Button>
						</div>
						<span className="col-start-3 justify-self-end text-xs text-muted-foreground tabular-nums">
							6 of 12
						</span>
					</div>
				</div>
			</div>
		</section>
	);
}

export function QuizSurface() {
	const [selected, setSelected] = useState<string | null>(null);
	const [graded, setGraded] = useState(false);
	const options = ["Nucleus", "Mitochondria", "Ribosome", "Golgi apparatus"] as const;

	return (
		<section className="flex h-full min-h-0 flex-col bg-background px-4 py-5 sm:px-8 sm:py-7">
			<div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-4">
				<div className="min-h-0 flex-1 overflow-y-auto pt-1">
					<div className="pb-5">
						<h2 className="text-lg font-medium sm:text-xl">
							Where does cellular respiration primarily occur?
						</h2>
					</div>
					<div role="radiogroup" aria-label="Answer options">
						{options.map((option, index) => {
							const isSelected = selected === option;
							const correct = option === "Mitochondria";
							return (
								<div key={option} className="border-t">
									<button
										type="button"
										role="radio"
										aria-checked={isSelected}
										disabled={graded}
										onClick={() => setSelected(option)}
										className={cn(
											"flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-4 text-left transition-colors",
											!graded && "hover:bg-accent/40",
											!graded && isSelected && "border-primary/60 bg-primary/5",
											graded && correct && "border-emerald-500/60 bg-emerald-500/10",
											graded && !correct && !isSelected && "opacity-60",
										)}
									>
										<span
											className={cn(
												"flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold text-muted-foreground",
												!graded &&
													isSelected &&
													"border-primary bg-primary text-primary-foreground",
												graded && correct && "border-emerald-600 bg-emerald-600 text-white",
												graded && isSelected && !correct && "border-red-600 bg-red-600 text-white",
											)}
										>
											{graded && correct ? (
												<Check className="size-3.5" />
											) : graded && isSelected ? (
												<X className="size-3.5" />
											) : (
												String.fromCharCode(65 + index)
											)}
										</span>
										<span className="text-sm">{option}</span>
									</button>
								</div>
							);
						})}
						<div className="border-t" />
					</div>
					{graded && (
						<div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm">
							<strong className="text-emerald-700 dark:text-emerald-400">
								{selected === "Mitochondria" ? "Correct" : "Mitochondria is correct"}
							</strong>
							<p className="mt-1 text-muted-foreground">
								Mitochondria convert energy from food into ATP.
							</p>
						</div>
					)}
				</div>
				<div className="space-y-3">
					<DemoProgressStrip
						ariaLabel="Quiz progress"
						currentIndex={2}
						segments={Array.from({ length: 10 }, (_, index) => ({
							id: String(index),
							label: `Question ${index + 1}`,
							tone: index < 2 ? ("correct" as const) : ("unseen" as const),
						}))}
					/>
					<div className="grid min-h-10 grid-cols-[1fr_auto_1fr] items-center gap-2">
						<span className="text-xs text-muted-foreground">2 answered</span>
						<span className="text-sm text-muted-foreground">3 of 10</span>
						<Button
							className="col-start-3 h-11 justify-self-end rounded-xl px-5"
							disabled={!selected || graded}
							onClick={() => setGraded(true)}
						>
							Submit
						</Button>
					</div>
				</div>
			</div>
		</section>
	);
}
