import { Shapes } from "lucide-react";

import { LandingCard } from "#/components/landing/LandingCard";
import { getWorkspaceItemTypeDisplay } from "#/features/workspaces/model/item-display";
import { workspaceColors } from "#/features/workspaces/model/workspace-colors";
import { cn } from "#/lib/utils";

import { FlashcardVisual } from "./visuals/FlashcardVisual";
import { QuizVisual } from "./visuals/QuizVisual";
import { WidgetVisual } from "./visuals/WidgetVisual";

const flashcardDisplay = getWorkspaceItemTypeDisplay("flashcard");
const quizDisplay = getWorkspaceItemTypeDisplay("quiz");

/**
 * One card per item type, each big enough to hold a working version of the
 * thing rather than a thumbnail of it. A flashcard that flips and a quiz you
 * can answer sell themselves; a 60px preview of either sells nothing.
 */
export function ItemTypesSection() {
	return (
		<section className="mt-14 sm:mt-20" aria-label="Create what you need">
			<h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
				Create what you need
			</h2>
			<div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
				<LandingCard
					badge={
						<flashcardDisplay.icon
							className={cn(
								"size-6 shrink-0",
								workspaceColors[flashcardDisplay.color].iconClassName,
							)}
							aria-hidden="true"
						/>
					}
					title="Flashcards"
					description="Study until it sticks."
					visual={<FlashcardVisual />}
				/>
				<LandingCard
					badge={
						<quizDisplay.icon
							className={cn("size-6 shrink-0", workspaceColors[quizDisplay.color].iconClassName)}
							aria-hidden="true"
						/>
					}
					title="Quizzes"
					description="Find out what you actually know."
					visual={<QuizVisual />}
				/>
				<LandingCard
					badge={
						<Shapes
							className={cn("size-6 shrink-0", workspaceColors.blue.iconClassName)}
							aria-hidden="true"
						/>
					}
					title="Widgets"
					description="Interactive tools built for whatever you need."
					visual={<WidgetVisual />}
				/>
			</div>
		</section>
	);
}
