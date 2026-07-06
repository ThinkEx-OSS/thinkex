import type { ReactNode } from "react";

import { FEATURES_SECTION_ID } from "#/components/landing/landing-sections";
import { cn } from "#/lib/utils";

import { CollaborationVisual } from "./visuals/CollaborationVisual";
import { IntegrationsVisual } from "./visuals/IntegrationsVisual";
import { ModelsVisual } from "./visuals/ModelsVisual";
import { WorkspaceChatVisual } from "./visuals/WorkspaceChatVisual";

export function FeatureGridSection() {
	return (
		<section
			id={FEATURES_SECTION_ID}
			className="mt-14 scroll-mt-6 sm:mt-20"
			aria-label="ThinkEx features"
		>
			<div className="max-w-2xl">
				<h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">Features</h2>
			</div>
			<div className="mt-6 grid gap-5 sm:grid-cols-2 lg:gap-6">
				<FeatureCard
					title="Live collaboration"
					description="Read and edit in your workspace together."
					visual={<CollaborationVisual />}
				/>
				<FeatureCard
					title="Use your favorite AI"
					description="Choose the right model for the task."
					visual={<ModelsVisual />}
				/>
				<FeatureCard
					title="Bring your sources and context"
					description="Work across documents, media, and more."
					visual={<IntegrationsVisual />}
				/>
				<FeatureCard
					title="Build from your materials"
					description="Turn sources into answers and drafts."
					visual={<WorkspaceChatVisual />}
				/>
			</div>
		</section>
	);
}

function FeatureCard({
	className,
	description,
	title,
	visual,
}: {
	className?: string;
	description: string;
	title: string;
	visual: ReactNode;
}) {
	return (
		<article
			className={cn(
				"group relative flex min-h-60 flex-col overflow-hidden rounded-md border border-border bg-background dark:bg-black",
				className,
			)}
		>
			<div className="flex min-h-0 flex-1 items-center justify-center border-border/60 border-b bg-background p-5 dark:bg-black">
				{visual}
			</div>
			<div className="bg-background p-5">
				<h3 className="text-xl font-medium tracking-tight text-balance sm:text-2xl">{title}</h3>
				<p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
			</div>
		</article>
	);
}
