import { FEATURES_SECTION_ID } from "#/components/landing/landing-sections";
import { LandingCard } from "#/components/landing/LandingCard";

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
			<h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">
				Start with your sources
			</h2>
			<div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
				<LandingCard
					badge={<StepBadge step={1} />}
					title="Bring everything in"
					description="PDFs, slides, images, and more."
					visual={<SourcesVisual />}
				/>
				{/* The least interesting of the three, which is why it sits in the middle:
				    people scan the ends of a row, so this reads as the step between the
				    other two rather than as a feature asking to be admired. */}
				<LandingCard
					badge={<StepBadge step={2} />}
					title="Organize how you want"
					description="Folders inside folders, if that helps."
					visual={<FoldersVisual />}
				/>
				<LandingCard
					badge={<StepBadge step={3} />}
					title="Get cited responses"
					description="Other apps make things up. ThinkEx shows its work."
					visual={<CitedAnswerVisual />}
				/>
			</div>
		</section>
	);
}

/**
 * Sits where the other sections put an icon. Outlined rather than filled: the
 * caption behind it is already tinted, so a `muted` disc would vanish into it.
 */
function StepBadge({ step }: { step: number }) {
	return (
		<span className="grid size-6 shrink-0 place-items-center rounded-full bg-background text-xs font-medium text-muted-foreground ring-1 ring-border">
			{step}
		</span>
	);
}
