import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";

import { CONTACT_EMAIL } from "#/components/community-links";
import { PRICING_SECTION_ID } from "#/components/landing/landing-sections";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

// Allowances must match autumn.config.ts, which is what actually gets granted.
// The two drift silently, and this page is where a wrong number becomes a
// promise you didn't keep.
const pricingPlans = [
	{
		id: "free",
		name: "Free",
		price: "$0",
		features: [
			"500 messages a month",
			"30 messages on premium models",
			"50 file uploads",
			"Live collaboration",
			"No credit card required",
		],
		cta: "Get started",
		emphasized: false,
	},
	{
		id: "pro",
		name: "Pro",
		price: "$7.99",
		priceSuffix: "per month",
		features: [
			"3,000 messages a month",
			"400 messages on premium models",
			"500 file uploads",
			"Live collaboration",
			"Priority access to new features",
		],
		cta: "Get started",
		emphasized: true,
	},
] as const;

export function PricingSection() {
	return (
		<section id={PRICING_SECTION_ID} className="mt-14 scroll-mt-6 sm:mt-20" aria-label="Pricing">
			<div className="max-w-2xl">
				<h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">Pricing</h2>
			</div>
			<div className="mt-6 grid gap-5 md:grid-cols-2 lg:gap-6">
				{pricingPlans.map((plan) => (
					<PricingPlanCard key={plan.id} plan={plan} />
				))}
			</div>
			<p className="mt-5 text-center text-sm text-muted-foreground">
				Organizations?{" "}
				<a
					href={`mailto:${CONTACT_EMAIL}`}
					className="font-medium text-foreground underline-offset-4 hover:underline"
				>
					Contact us
				</a>
				.
			</p>
		</section>
	);
}

function PricingPlanCard({ plan }: { plan: (typeof pricingPlans)[number] }) {
	return (
		<article
			className={cn(
				"flex flex-col rounded-md border border-border bg-background p-5 dark:bg-black",
				plan.emphasized && "border-foreground/30",
			)}
		>
			<div className="flex items-start justify-between gap-4">
				<div>
					<h3 className="text-2xl font-medium tracking-tight">{plan.name}</h3>
				</div>
				<div className="shrink-0 text-right">
					<div className="text-xl font-medium tracking-tight">{plan.price}</div>
					{"priceSuffix" in plan ? (
						<div className="text-xs text-muted-foreground">{plan.priceSuffix}</div>
					) : null}
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
			<Button
				nativeButton={false}
				render={<Link to="/login" />}
				variant={plan.emphasized ? "default" : "outline"}
				className="mt-8 w-full"
			>
				{plan.cta}
			</Button>
		</article>
	);
}
