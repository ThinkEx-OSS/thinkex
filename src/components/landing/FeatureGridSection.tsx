import { Bot, BookOpenText, type LucideIcon, Users } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

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
			<div className="max-w-2xl">
				<h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
					All built in
				</h2>
				<p className="mt-4 text-base leading-7 text-muted-foreground">
					No plugins, no extensions, nothing else to set up.
				</p>
			</div>
			{/* Two wide tiles over three narrow ones. Equal cards would read as a
			    plain grid, and the point of the row is that these are not equal. */}
			<div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
				<FeatureCard
					icon={Bot}
					iconClassName="text-violet-600 dark:text-violet-400"
					title="Use your favorite AI"
					description="Choose the right model for the task."
					visual={<ModelsVisual />}
				/>
				<FeatureCard
					icon={BookOpenText}
					iconClassName="text-emerald-600 dark:text-emerald-400"
					title="43 million papers"
					description="Search across a curated index, not just the web."
					visual={<ResearchVisual />}
				/>
				<FeatureCard
					icon={Users}
					iconClassName="text-sky-600 dark:text-sky-400"
					title="Live collaboration"
					description="Work together with friends and teammates."
					visual={<CollaborationVisual />}
				/>
			</div>
		</section>
	);
}

function FeatureCard({
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
