import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

/**
 * Asks the AI for help with the item on screen — a hint before answering, a
 * fuller explanation after. Amber everywhere so "ask AI" reads the same in
 * every study viewer.
 */
export function StudyAiActionButton({
	className,
	label,
	onSend,
}: {
	className?: string;
	label: string;
	onSend: () => void;
}) {
	return (
		<Button
			variant="ghost"
			size="sm"
			className={cn(
				"text-amber-600 hover:bg-amber-500/10 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300",
				className,
			)}
			onClick={(event) => {
				event.stopPropagation();
				onSend();
			}}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<Lightbulb />
			{label}
		</Button>
	);
}

/** Previous/next step in a study session. `noun` names the step: "card", "question". */
export function StudyNavButton({
	direction,
	disabled,
	noun,
	onClick,
}: {
	direction: "next" | "previous";
	disabled: boolean;
	noun: string;
	onClick: () => void;
}) {
	const label = `${direction === "next" ? "Next" : "Previous"} ${noun}`;
	return (
		<Button
			variant="ghost"
			size="icon-lg"
			aria-label={label}
			title={`${label} (${direction === "next" ? "Right" : "Left"} arrow)`}
			className="size-11 rounded-xl [&_svg]:size-4.5 sm:size-12 sm:[&_svg]:size-5"
			disabled={disabled}
			onClick={onClick}
		>
			{direction === "next" ? <ChevronRight /> : <ChevronLeft />}
		</Button>
	);
}
