import type { ReactNode } from "react";
import { Check } from "lucide-react";

import type { PricingPlan } from "#/features/account/pricing";
import { cn } from "#/lib/utils";

export function PricingPlanCard({ action, plan }: { action?: ReactNode; plan: PricingPlan }) {
	return (
		<article
			className={cn(
				"flex flex-col rounded-md border border-border bg-card p-5",
				plan.emphasized && "border-foreground/30",
			)}
		>
			<div className="flex items-start justify-between gap-4">
				<h3 className="text-2xl font-medium tracking-tight">{plan.name}</h3>
				<div className="shrink-0 text-right">
					<div className="text-3xl font-medium tracking-tight">{plan.price}</div>
					<div className="text-sm text-muted-foreground">
						{"priceSuffix" in plan ? plan.priceSuffix : "\u00A0"}
					</div>
				</div>
			</div>
			<ul className="mt-6 grid gap-3 text-sm text-muted-foreground">
				{plan.features.map((feature) => (
					<li key={feature} className="flex items-center gap-2">
						<Check className="size-4 shrink-0 text-foreground/70" aria-hidden="true" />
						<span>{feature}</span>
					</li>
				))}
			</ul>
			{action ? <div className="mt-auto pt-8">{action}</div> : null}
		</article>
	);
}
