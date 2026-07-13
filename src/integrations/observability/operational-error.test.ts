import { describe, expect, it } from "vitest";

import { buildOperationalErrorFields } from "#/integrations/observability/operational-error";

describe("operational error fields", () => {
	it("preserves structured Durable Object error details", () => {
		const error = Object.assign(new Error("Durable Object storage timed out\nwhile starting"), {
			code: "storage_timeout",
			overloaded: false,
			retryable: true,
		});

		expect(buildOperationalErrorFields(error)).toMatchObject({
			error_code: "storage_timeout",
			error_message: "Durable Object storage timed out while starting",
			error_overloaded: false,
			error_retryable: true,
			error_type: "Error",
		});
	});

	it("bounds error messages before logging them", () => {
		const fields = buildOperationalErrorFields(new Error("x".repeat(2_000)));

		expect(fields.error_message).toHaveLength(1_000);
	});
});
