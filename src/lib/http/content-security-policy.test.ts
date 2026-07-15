import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "#/lib/http/content-security-policy";

const r2AccountId = "676650ed1ca37ffdeba997fb2a7fa24a";

describe("content security policy", () => {
	it("allows the configured R2 account without weakening connect-src", () => {
		const policy = buildContentSecurityPolicy({
			applicationOrigin: "https://thinkex.app",
			isProduction: true,
			posthogHostOrigin: "https://h.thinkex.app",
			posthogReportUrl: "https://h.thinkex.app/report/?token=test",
			r2AccountId,
		});

		expect(policy).toContain(
			`connect-src 'self' https://cloudflareinsights.com wss://thinkex.app https://h.thinkex.app https://${r2AccountId}.r2.cloudflarestorage.com`,
		);
		expect(policy).not.toContain(" wss: ");
		expect(policy).not.toContain("*.r2.cloudflarestorage.com");
		expect(policy).not.toContain("connect-src https:");
		expect(policy).not.toContain("'unsafe-eval'");
		expect(policy).toContain("report-uri https://h.thinkex.app/report/?token=test");
	});

	it("does not put malformed account identifiers into a response header", () => {
		const policy = buildContentSecurityPolicy({
			applicationOrigin: "javascript:alert(1)",
			isProduction: true,
			r2AccountId: "invalid\nconnect-src https:",
		});

		expect(policy).not.toContain("r2.cloudflarestorage.com");
		expect(policy).not.toContain("invalid");
		expect(policy).not.toContain("javascript:");
	});
});
