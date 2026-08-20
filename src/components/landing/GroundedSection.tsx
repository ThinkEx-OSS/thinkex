import type { ReactNode } from "react";

import { FEATURES_SECTION_ID } from "#/components/landing/landing-sections";

import { CitedAnswerVisual } from "./visuals/CitedAnswerVisual";
import { FoldersVisual } from "./visuals/FoldersVisual";
import { SourcesVisual } from "./visuals/SourcesVisual";

/**
 * What goes in, how it is kept, and what you get back. There is no fourth "and
 * then you make things" step here because the section below is that step, shown
 * rather than described.
 */
export function GroundedSection() {
	return (
		<section
			id={FEATURES_SECTION_ID}
			className="mt-14 scroll-mt-6 sm:mt-20"
			aria-label="Start with your sources"
		>
			<div className="max-w-2xl">
				<h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
					Start with your sources
				</h2>
				<p className="mt-4 text-base leading-7 text-muted-foreground">
					Read them yourself or ask the AI. Either way they stay in your workspace.
				</p>
			</div>
			<div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
				<Panel
					step={1}
					title="Bring everything in"
					description="PDFs, slides, images, and more."
					visual={<SourcesVisual />}
				/>
				{/* The least interesting of the three, which is why it sits in the middle:
				    people scan the ends of a row, so this reads as the step between the
				    other two rather than as a feature asking to be admired. */}
				<Panel
					step={2}
					title="Organize how you want"
					description="Folders inside folders, if that helps."
					visual={<FoldersVisual />}
				/>
				<Panel
					step={3}
					title="Get cited responses"
					description="Other apps make things up. ThinkEx shows its work."
					visual={<CitedAnswerVisual />}
				/>
			</div>
		</section>
	);
}

function Panel({
	description,
	step,
	title,
	visual,
}: {
	description: string;
	step: number;
	title: string;
	visual: ReactNode;
}) {
	return (
		<article className="flex min-h-72 flex-col overflow-hidden rounded-md border border-border bg-background dark:bg-black">
			<div className="flex min-h-0 flex-1 items-center justify-center border-border/60 border-b p-5">
				{visual}
			</div>
			<div className="p-5">
				<div className="flex items-center gap-2.5">
					<span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
						{step}
					</span>
					<h3 className="text-xl font-medium tracking-tight text-balance sm:text-2xl">{title}</h3>
				</div>
				<p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
			</div>
		</article>
	);
}
