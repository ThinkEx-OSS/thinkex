import { type LucideIcon, Shapes } from "lucide-react";
import type { ReactNode } from "react";

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
				<ItemCard
					title="Flashcards"
					description="Study until it sticks."
					icon={flashcardDisplay.icon}
					iconClassName={workspaceColors[flashcardDisplay.color].iconClassName}
					visual={<FlashcardVisual />}
				/>
				<ItemCard
					title="Quizzes"
					description="Find out what you actually know."
					icon={quizDisplay.icon}
					iconClassName={workspaceColors[quizDisplay.color].iconClassName}
					visual={<QuizVisual />}
				/>
				<ItemCard
					title="Widgets"
					description="Interactive tools built for whatever you need."
					icon={Shapes}
					iconClassName={workspaceColors.blue.iconClassName}
					visual={<WidgetVisual />}
				/>
			</div>
		</section>
	);
}

function ItemCard({
	description,
	icon: Icon,
	iconClassName,
	title,
	visual,
}: {
	description: string;
	icon: LucideIcon;
	iconClassName: string;
	title: string;
	visual: ReactNode;
}) {
	return (
		<article className="flex min-h-72 flex-col overflow-hidden rounded-md border border-border bg-background dark:bg-black">
			<div className="flex min-h-0 flex-1 items-center justify-center border-border/60 border-b p-5">
				{visual}
			</div>
			<div className="p-5">
				<div className="flex items-center gap-2">
					<Icon className={cn("size-6 shrink-0", iconClassName)} aria-hidden="true" />
					<h3 className="text-xl font-medium tracking-tight text-balance sm:text-2xl">{title}</h3>
				</div>
				<p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
			</div>
		</article>
	);
}
