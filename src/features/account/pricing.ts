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

// Only monthly is sold. `pro_annual` still exists in autumn.config.ts so an
// existing annual subscriber keeps reading as Pro, but nothing offers it.
export const PRICING_PLANS = [
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

export type PricingPlan = (typeof PRICING_PLANS)[number];
