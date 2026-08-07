import { describe, expect, it } from "vitest";

import {
	getWorkspaceAiChatModelById,
	WORKSPACE_AI_CHAT_MODELS,
} from "#/features/workspaces/ai/models";
import { resolveWorkspaceAiMessageAccess } from "#/integrations/autumn/workspace-ai-access";

const RESETS_AT = 1_788_400_648_450;

describe("resolveWorkspaceAiMessageAccess", () => {
	it("runs the chosen model while its tier has balance", () => {
		for (const chosenModelId of ["auto", "claude-sonnet", "claude-haiku"] as const) {
			expect(
				resolveWorkspaceAiMessageAccess({
					chosenModelId,
					chosenTierAllowed: true,
					fallbackTierAllowed: false,
					resetsAt: RESETS_AT,
				}),
			).toEqual({ allowed: true, modelId: chosenModelId });
		}
	});

	it("falls back to auto when premium is spent but standard remains", () => {
		for (const chosenModelId of ["claude-sonnet", "gpt-terra", "gemini-pro"] as const) {
			expect(
				resolveWorkspaceAiMessageAccess({
					chosenModelId,
					chosenTierAllowed: false,
					fallbackTierAllowed: true,
					resetsAt: RESETS_AT,
				}),
			).toEqual({ allowed: true, modelId: "auto" });
		}
	});

	// The regression this guards against: standard used to promote the turn into a
	// premium model, so the heaviest free users got the priciest model in the
	// catalog for their last stretch of the month, billed against the tier that is
	// supposed to be the upgrade prompt.
	it("blocks a standard model when standard is spent, even with premium left", () => {
		for (const chosenModelId of ["auto", "claude-haiku"] as const) {
			expect(
				resolveWorkspaceAiMessageAccess({
					chosenModelId,
					chosenTierAllowed: false,
					fallbackTierAllowed: true,
					resetsAt: RESETS_AT,
				}),
			).toEqual({ allowed: false, resetsAt: RESETS_AT });
		}
	});

	it("blocks with the reset date once both tiers are spent", () => {
		expect(
			resolveWorkspaceAiMessageAccess({
				chosenModelId: "claude-sonnet",
				chosenTierAllowed: false,
				fallbackTierAllowed: false,
				resetsAt: RESETS_AT,
			}),
		).toEqual({ allowed: false, resetsAt: RESETS_AT });
	});

	it("still blocks when no reset date is known", () => {
		expect(
			resolveWorkspaceAiMessageAccess({
				chosenModelId: "auto",
				chosenTierAllowed: false,
				fallbackTierAllowed: false,
				resetsAt: null,
			}),
		).toEqual({ allowed: false, resetsAt: null });
	});

	// A fallback must never land on a model from the tier that is already empty,
	// or an exhausted user would be handed a model they cannot run.
	it("never falls back into the tier that is exhausted", () => {
		const premiumSpent = resolveWorkspaceAiMessageAccess({
			chosenModelId: "gemini-pro",
			chosenTierAllowed: false,
			fallbackTierAllowed: true,
			resetsAt: null,
		});

		if (!premiumSpent.allowed) {
			throw new Error("expected a fallback");
		}

		expect(getWorkspaceAiChatModelById(premiumSpent.modelId).billingTier).toBe("standard");
	});
});

// A guard on the hardcoded mapping rather than logic replacing it. Deriving the
// cheapest model would let array order decide a three-way tie, so the pick stays
// explicit — but gateway prices move (Luna was cut mid-quarter, and every weight
// in models.ts was rewritten after), and nothing else would notice the fallback
// quietly becoming the priciest model in the tier it lands on.
describe("fallback pricing", () => {
	it("lands on the cheapest model in the tier it falls back to", () => {
		for (const chosenModelId of ["claude-sonnet", "gpt-terra", "gemini-pro"] as const) {
			const access = resolveWorkspaceAiMessageAccess({
				chosenModelId,
				chosenTierAllowed: false,
				fallbackTierAllowed: true,
				resetsAt: null,
			});

			if (!access.allowed) {
				throw new Error("expected a fallback");
			}

			const landedOn = getWorkspaceAiChatModelById(access.modelId);
			const cheapestInTier = Math.min(
				...WORKSPACE_AI_CHAT_MODELS.filter(
					(model) => model.billingTier === landedOn.billingTier,
				).map((model) => model.cost),
			);

			expect(landedOn.cost).toBe(cheapestInTier);
		}
	});
});
