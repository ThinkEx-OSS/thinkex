import { describe, expect, it } from "vitest";

import { getGatewayServedRoute } from "#/integrations/posthog/ai-observability";

// Shape taken from a real providerMetadata.gateway.routing payload.
function routing(
	attempts: { provider: string; credentialType: string; success: boolean }[],
	canonicalSlug = "openai/gpt-test",
) {
	return {
		gateway: {
			routing: {
				finalProvider: attempts.find((attempt) => attempt.success)?.provider,
				modelAttempts: [{ canonicalSlug, success: true, providerAttempts: attempts }],
			},
		},
	};
}

describe("getGatewayServedRoute", () => {
	it("reports the provider that answered, not the first tried", () => {
		expect(
			getGatewayServedRoute(
				routing([
					{ provider: "openai", credentialType: "byok", success: false },
					{ provider: "azure", credentialType: "byok", success: true },
				]),
			),
		).toEqual({
			provider: "azure",
			credentialType: "byok",
			providerAttemptCount: 2,
			failedProviderAttemptCount: 1,
			routingRecovered: true,
			serviceTier: undefined,
			servedModel: "openai/gpt-test",
			modelAttemptCount: 1,
			failedModelAttemptCount: 0,
		});
	});

	// The case worth catching: served on Vercel's credits after our key failed.
	it("reports system credentials when BYOK fell through", () => {
		expect(
			getGatewayServedRoute(
				routing([
					{ provider: "openai", credentialType: "byok", success: false },
					{ provider: "openai", credentialType: "system", success: true },
				]),
			).credentialType,
		).toBe("system");
	});

	// A granted priority tier bills ~2x, and the gateway reports a downgrade by
	// omitting the field rather than saying "default".
	it("reports the tier that was served, and nothing when priority was downgraded", () => {
		const served = routing([{ provider: "openai", credentialType: "byok", success: true }]);

		expect(
			getGatewayServedRoute({ gateway: { ...served.gateway, serviceTier: "priority" } }),
		).toMatchObject({
			provider: "openai",
			credentialType: "byok",
			serviceTier: "priority",
			providerAttemptCount: 1,
			failedProviderAttemptCount: 0,
			routingRecovered: false,
			servedModel: "openai/gpt-test",
			modelAttemptCount: 1,
			failedModelAttemptCount: 0,
		});
		expect(getGatewayServedRoute(served).serviceTier).toBeUndefined();
	});

	it("returns nothing for a non-gateway result, so callers keep their own value", () => {
		expect(getGatewayServedRoute(undefined)).toEqual({
			provider: undefined,
			credentialType: undefined,
			providerAttemptCount: 0,
			failedProviderAttemptCount: 0,
			routingRecovered: false,
			serviceTier: undefined,
			servedModel: undefined,
			modelAttemptCount: 0,
			failedModelAttemptCount: 0,
		});
		expect(getGatewayServedRoute({ anthropic: {} }).provider).toBeUndefined();
	});

	it("reports the model attempt that won a cross-model fallback", () => {
		const metadata = {
			gateway: {
				routing: {
					finalProvider: "openai",
					modelAttempts: [
						{ canonicalSlug: "anthropic/claude-sonnet-5", success: false, providerAttempts: [] },
						{
							canonicalSlug: "openai/gpt-5.6-terra",
							success: true,
							providerAttempts: [{ provider: "openai", credentialType: "byok", success: true }],
						},
					],
				},
			},
		};

		expect(getGatewayServedRoute(metadata)).toMatchObject({
			servedModel: "openai/gpt-5.6-terra",
			modelAttemptCount: 2,
			failedModelAttemptCount: 1,
			routingRecovered: true,
		});
	});
});
