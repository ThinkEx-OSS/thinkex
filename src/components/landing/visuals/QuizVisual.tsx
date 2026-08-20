import { Check, Lightbulb, X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

// Four options, correct answer second: a quiz whose answer is always first
// reads as a mock-up rather than a quiz.
const OPTIONS = [
	{ id: "a", label: "Venus", correct: false },
	{ id: "b", label: "Mercury", correct: true },
	{ id: "c", label: "Mars", correct: false },
	{ id: "d", label: "Earth", correct: false },
] as const;

/** A question you can answer, with the grading a real quiz would give you. */
export function QuizVisual() {
	const [answeredId, setAnsweredId] = useState<(typeof OPTIONS)[number]["id"] | null>(null);
	const [hintOpen, setHintOpen] = useState(false);
	const hintId = useId();

	return (
		<div className="flex min-h-52 w-full flex-col justify-center gap-3">
			<div className="relative flex items-start justify-between gap-2">
				<p className="text-sm leading-6 font-medium">Which planet has the shortest year?</p>
				{/* A plain Button rather than StudyAiActionButton: this is a disclosure,
				    not a send, and the study control carries stopPropagation rules that
				    belong to the study session. */}
				<Button
					variant="ghost"
					size="sm"
					aria-expanded={hintOpen}
					aria-controls={hintId}
					onClick={() => setHintOpen((open) => !open)}
					className="-mt-1 shrink-0 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
				>
					<Lightbulb />
					Hint
				</Button>
				{hintOpen ? (
					<div
						id={hintId}
						className="absolute top-8 right-0 z-10 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md"
					>
						You don't need a hint for this :)
					</div>
				) : null}
			</div>
			<div className="grid gap-2" aria-live="polite">
				{OPTIONS.map((option) => {
					const isAnswered = answeredId !== null;
					const isPicked = option.id === answeredId;
					const reveal = isAnswered && (option.correct || isPicked);

					return (
						<button
							key={option.id}
							type="button"
							aria-pressed={isPicked}
							onClick={() => setAnsweredId(option.id)}
							className={cn(
								"cursor-pointer flex min-w-0 items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
								reveal && option.correct && "border-emerald-600/50 bg-emerald-500/10",
								reveal && !option.correct && "border-rose-600/50 bg-rose-500/10",
								!reveal && "border-border/70 bg-background hover:bg-muted/40 dark:bg-white/[0.02]",
							)}
						>
							<span
								className={cn(
									"grid size-4 shrink-0 place-items-center rounded-full border",
									reveal && option.correct && "border-emerald-600 bg-emerald-600 text-white",
									reveal && !option.correct && "border-rose-600 bg-rose-600 text-white",
									!reveal && "border-foreground/30",
								)}
							>
								{reveal && option.correct ? <Check className="size-3" aria-hidden="true" /> : null}
								{reveal && !option.correct ? <X className="size-3" aria-hidden="true" /> : null}
							</span>
							<span className="min-w-0 flex-1 leading-5">{option.label}</span>
							{reveal ? (
								<span className="sr-only">{option.correct ? "Correct" : "Incorrect"}</span>
							) : null}
						</button>
					);
				})}
			</div>
		</div>
	);
}
