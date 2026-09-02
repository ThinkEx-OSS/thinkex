import { feature, item, plan } from "atmn";

// Metered per message and per upload, one unit each — not by credit weight. The
// `cost` ladder in features/workspaces/ai/models.ts prices models against each
// other for routing, and deliberately does not reach allowances: students are
// not developers, and a balance they have to do arithmetic against is the thing
// that makes people ration instead of use the product. The two tiers are how
// model cost is reflected, which is as much arithmetic as anyone should face.

// Features
export const standardMessages = feature({
	id: "standard_messages",
	name: "Standard Messages",
	type: "metered",
	consumable: true,
});

export const premiumMessages = feature({
	id: "premium_messages",
	name: "Premium Messages",
	type: "metered",
	consumable: true,
});

// Extraction is billed per page by Firecrawl, but metered here per upload:
// nobody knows a PDF's page count before uploading, and a balance that drops by
// an unpredictable amount per upload is exactly the anxiety we're avoiding.
//
// Named "file uploads" rather than "documents" on purpose — Document is already
// a workspace item type, and two meanings of the word would confuse both users
// and us.
export const fileUploads = feature({
	id: "file_uploads",
	name: "File uploads",
	type: "metered",
	consumable: true,
});

// Plans
export const free = plan({
	id: "free",
	name: "Free",
	autoEnable: true,
	items: [
		item({
			featureId: standardMessages.id,
			included: 500,
			reset: {
				interval: "month",
			},
		}),
		// A taste of premium rather than a wall in front of it, and the upgrade
		// prompt.
		item({
			featureId: premiumMessages.id,
			included: 30,
			reset: {
				interval: "month",
			},
		}),
		// Matches Gemini Notebook's (formerly NotebookLM) free 50 sources on
		// purpose. Being stingier than the
		// free competitor students already have open in a tab is a worse problem
		// than eating the extraction cost.
		item({
			featureId: fileUploads.id,
			included: 50,
			reset: {
				interval: "month",
			},
		}),
	],
});

const proItems = [
	item({
		featureId: standardMessages.id,
		included: 3000,
		reset: {
			interval: "month",
		},
	}),
	item({
		featureId: premiumMessages.id,
		included: 400,
		reset: {
			interval: "month",
		},
	}),
	item({
		featureId: fileUploads.id,
		included: 500,
		reset: {
			interval: "month",
		},
	}),
];

export const pro = plan({
	id: "pro",
	name: "Pro",
	price: {
		amount: 8,
		interval: "month",
	},
	items: proItems,
});

export const proAnnual = pro.variant({
	id: "pro_annual",
	name: "Pro Annual",
	customize: {
		price: {
			amount: 84,
			interval: "year",
		},
	},
});
