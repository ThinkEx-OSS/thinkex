import { describe, expect, it } from "vitest";

import {
	getWorkspaceAiFallbackModelId,
	resolveWorkspaceAiMessageAccess,
} from "#/integrations/autumn/workspace-ai-access";

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

	// The failure this guards against: auto is the model nobody changes, so if it
	// blocked the moment standard ran out, the default experience would break
	// first while a premium balance sat unused.
	it("routes a standard model to premium when standard is spent", () => {
		expect(
			resolveWorkspaceAiMessageAccess({
				chosenModelId: "auto",
				chosenTierAllowed: false,
				fallbackTierAllowed: true,
				resetsAt: RESETS_AT,
			}),
		).toEqual({ allowed: true, modelId: "claude-sonnet" });
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
		const standardSpent = resolveWorkspaceAiMessageAccess({
			chosenModelId: "gemini",
			chosenTierAllowed: false,
			fallbackTierAllowed: true,
			resetsAt: null,
		});

		expect(premiumSpent).toEqual({ allowed: true, modelId: "auto" });
		expect(standardSpent).toEqual({ allowed: true, modelId: "claude-sonnet" });
	});
});

// The composer names this model to the user before they send. It used to assume
// "auto", which is right only when the empty tier is premium — so a user on Auto
// who ran out of standard was told Auto would answer while the turn actually ran
// on Claude Sonnet and spent premium allowance.
describe("getWorkspaceAiFallbackModelId", () => {
	it("sends a premium model down to auto", () => {
		expect(getWorkspaceAiFallbackModelId("claude-sonnet")).toBe("auto");
	});

	it("sends a standard model up to the premium fallback", () => {
		expect(getWorkspaceAiFallbackModelId("auto")).toBe("claude-sonnet");
	});

	it("agrees with the model the gate actually picks", () => {
		for (const modelId of ["auto", "gemini", "claude-sonnet", "gemini-pro"] as const) {
			const access = resolveWorkspaceAiMessageAccess({
				chosenModelId: modelId,
				chosenTierAllowed: false,
				fallbackTierAllowed: true,
				resetsAt: null,
			});

			expect(access).toEqual({ allowed: true, modelId: getWorkspaceAiFallbackModelId(modelId) });
		}
	});
});
