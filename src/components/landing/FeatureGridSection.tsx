import { Bot, BookOpenText, Users } from "lucide-react";

import { LandingCard } from "#/components/landing/LandingCard";

import { CollaborationVisual } from "./visuals/CollaborationVisual";
import { ModelsVisual } from "./visuals/ModelsVisual";
import { ResearchVisual } from "./visuals/ResearchVisual";

/**
 * Everything that matters but is not the main story. These are deliberately
 * the smallest cards on the page: live collaboration and folders belong here,
 * not competing with the item types for attention.
 */
export function FeatureGridSection() {
	return (
		<section className="mt-14 sm:mt-20" aria-label="All built in">
			<h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">All built in</h2>
			<div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
				<LandingCard
					badge={
						<Bot
							className="size-6 shrink-0 text-violet-600 dark:text-violet-400"
							aria-hidden="true"
						/>
					}
					title="Use your favorite AI"
					description="Choose the right model for the task."
					visual={<ModelsVisual />}
				/>
				{/* Figure per Firecrawl's Research Index docs, checked 2026-08-19:
				    "roughly 43 million paper abstracts". Recheck before editing it. */}
				<LandingCard
					badge={
						<BookOpenText
							className="size-6 shrink-0 text-emerald-600 dark:text-emerald-400"
							aria-hidden="true"
						/>
					}
					title="43 million papers"
					description="Search across a curated index, not just the web."
					visual={<ResearchVisual />}
				/>
				<LandingCard
					badge={
						<Users className="size-6 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden="true" />
					}
					title="Live collaboration"
					description="Work together with friends and teammates."
					visual={<CollaborationVisual />}
				/>
			</div>
		</section>
	);
}
