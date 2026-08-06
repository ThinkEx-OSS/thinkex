export type BillingPeriod = "annual" | "monthly";

const freePlan = {
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
	emphasized: false,
} as const;

const proFeatures = [
	"3,000 messages a month",
	"400 messages on premium models",
	"500 file uploads",
	"Live collaboration",
	"Priority access to new features",
] as const;

export function getPricingPlans(billingPeriod: BillingPeriod) {
	return [
		freePlan,
		{
			id: "pro",
			name: "Pro",
			price: billingPeriod === "annual" ? "$7" : "$8",
			priceSuffix: billingPeriod === "annual" ? "per month, billed $84 yearly" : "per month",
			features: proFeatures,
			emphasized: true,
		},
	] as const;
}

export type PricingPlan = ReturnType<typeof getPricingPlans>[number];
