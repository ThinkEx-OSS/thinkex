export type BillingPeriod = "annual" | "monthly";

const freePlan = {
	id: "free",
	name: "Free",
	price: "$0",
	pricePeriod: "/month",
	features: [
		"500 messages a month",
		"30 messages on premium models",
		"50 file uploads",
		"Live collaboration",
		"No credit card required",
	],
	emphasized: false,
} as const;

const proFeatures = [
	"3,000 messages a month",
	"400 messages on premium models",
	"500 file uploads",
	"Live collaboration",
	"Priority access to new features",
] as const;

/**
 * Only monthly pricing is shown. Annual still exists in the backend (see
 * PRO_PLAN_IDS in billing-functions and the `billing` search param), it just
 * isn't offered in the UI yet.
 */
export function getPricingPlans() {
	return [
		freePlan,
		{
			id: "pro",
			name: "Pro",
			price: "$8",
			pricePeriod: "/month",
			features: proFeatures,
			emphasized: true,
		},
	] as const;
}

export type PricingPlan = ReturnType<typeof getPricingPlans>[number];
