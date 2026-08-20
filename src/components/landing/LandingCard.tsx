import type { ReactNode } from "react";

/**
 * The shell every card on the landing page shares: a visual on top, a tinted
 * caption below it. The tint is what sets the caption off from the visual, so
 * the card reads as two bands rather than one flat panel.
 *
 * The two alphas are not a matched pair: light tints down from a near-white
 * page, dark tints up from a black card, and the same value reads much stronger
 * in one than the other. Tune them separately.
 *
 * `badge` is a node rather than an icon prop because the numbered steps and the
 * item-type icons want the same slot and nothing else in common.
 */
export function LandingCard({
	badge,
	description,
	title,
	visual,
}: {
	badge: ReactNode;
	description: string;
	title: string;
	visual: ReactNode;
}) {
	return (
		<article className="flex min-h-72 flex-col overflow-hidden rounded-md border border-border bg-background dark:bg-black">
			<div className="flex min-h-0 flex-1 items-center justify-center border-border/60 border-b p-5">
				{visual}
			</div>
			<div className="bg-muted/30 p-5 dark:bg-muted/55">
				<div className="flex items-center gap-2.5">
					{badge}
					<h3 className="text-xl font-medium tracking-tight text-balance sm:text-2xl">{title}</h3>
				</div>
				<p className="mt-3 text-sm leading-6 text-muted-foreground">{description}</p>
			</div>
		</article>
	);
}
