import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { CONTACT_EMAIL } from "#/components/community-links";
import { PRICING_SECTION_ID } from "#/components/landing/landing-sections";
import { Button } from "#/components/ui/button";
import { BillingPeriodSelector } from "#/features/account/components/BillingPeriodSelector";
import { PricingPlanCard } from "#/features/account/components/PricingPlanCard";
import { type BillingPeriod, getPricingPlans } from "#/features/account/pricing";

// Allowances must match autumn.config.ts, which is what actually gets granted.
// The two drift silently, and this page is where a wrong number becomes a
// promise you didn't keep.

export function PricingSection() {
	const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("annual");
	const pricingPlans = getPricingPlans(billingPeriod);

	return (
		<section id={PRICING_SECTION_ID} className="mt-14 scroll-mt-6 sm:mt-20" aria-label="Pricing">
			<div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
				<h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">Pricing</h2>
				<BillingPeriodSelector onChange={setBillingPeriod} value={billingPeriod} />
			</div>
			<div className="mt-6 grid gap-5 md:grid-cols-2 lg:gap-6 dark:[&_article]:bg-black">
				{pricingPlans.map((plan) => (
					<PricingPlanCard
						key={plan.id}
						plan={plan}
						action={
							<Button
								nativeButton={false}
								render={
									<Link
										to="/login"
										search={{
											redirect:
												plan.id === "pro" ? `/home?upgrade=true&billing=${billingPeriod}` : "/home",
										}}
									/>
								}
								variant={plan.emphasized ? "default" : "outline"}
								className="w-full"
							>
								Get started
							</Button>
						}
					/>
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
