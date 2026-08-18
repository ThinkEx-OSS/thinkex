import { Link } from "@tanstack/react-router";

import { CONTACT_EMAIL } from "#/components/community-links";
import { PRICING_SECTION_ID } from "#/components/landing/landing-sections";
import { Button } from "#/components/ui/button";
import { PricingPlanCard } from "#/features/account/components/PricingPlanCard";
import { PRICING_PLANS } from "#/features/account/pricing";

// Allowances must match autumn.config.ts, which is what actually gets granted.
// The two drift silently, and this page is where a wrong number becomes a
// promise you didn't keep.

export function PricingSection() {
	return (
		<section id={PRICING_SECTION_ID} className="mt-14 scroll-mt-6 sm:mt-20" aria-label="Pricing">
			<h2 className="text-3xl font-medium tracking-tight text-balance sm:text-4xl">Pricing</h2>
			<div className="mt-6 grid gap-5 md:grid-cols-2 lg:gap-6 dark:[&_article]:bg-black">
				{PRICING_PLANS.map((plan) => (
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
											redirect: plan.id === "pro" ? "/home?upgrade=true" : "/home",
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
