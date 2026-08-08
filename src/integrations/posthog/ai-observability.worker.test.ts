import { describe, expect, it } from "vitest";

import { getGatewayServedRoute } from "#/integrations/posthog/ai-observability";

// Shape taken from a real providerMetadata.gateway.routing payload.
function routing(attempts: { provider: string; credentialType: string; success: boolean }[]) {
	return {
		gateway: {
			routing: {
				finalProvider: attempts.find((attempt) => attempt.success)?.provider,
				modelAttempts: [{ providerAttempts: attempts }],
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
		).toEqual({ provider: "azure", credentialType: "byok" });
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

	it("returns nothing for a non-gateway result, so callers keep their own value", () => {
		expect(getGatewayServedRoute(undefined)).toEqual({
			provider: undefined,
			credentialType: undefined,
		});
		expect(getGatewayServedRoute({ anthropic: {} }).provider).toBeUndefined();
	});
});
