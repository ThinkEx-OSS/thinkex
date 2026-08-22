import { Bot, Users } from "lucide-react";

import { LandingCard } from "#/components/landing/LandingCard";

import { CollaborationVisual } from "./visuals/CollaborationVisual";
import { ModelsVisual } from "./visuals/ModelsVisual";

/**
 * Everything that matters but is not the main story. These are deliberately
 * the smallest cards on the page, not competing with the item types for attention.
 */
export function FeatureGridSection() {
	return (
		<section className="mt-14 sm:mt-20" aria-label="All built in">
			<h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">All built in</h2>
			<div className="mt-6 grid gap-5 md:grid-cols-2 lg:gap-6">
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
