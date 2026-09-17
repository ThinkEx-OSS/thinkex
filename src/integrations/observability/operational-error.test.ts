import { describe, expect, it } from "vitest";

import {
	buildOperationalErrorFields,
	normalizeCapturedError,
} from "#/integrations/observability/operational-error";

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

	it("drops bound parameters from a drizzle query error before capture", () => {
		const cause = Object.assign(new Error("Internal error."), { name: "DatabaseError" });
		const drizzleError = Object.assign(
			new Error('Failed query: select "id" from "user" where "id" = $1\nparams: user_123'),
			{
				cause,
				params: ["user_123"],
				query: 'select "id" from "user" where "id" = $1',
				stack: "Error: Failed query: ...\nparams: user_123\n    at read (client.server.ts:1:1)",
			},
		);

		const normalized = normalizeCapturedError(drizzleError);

		expect(buildOperationalErrorFields(normalized)).toMatchObject({
			error_cause_message: "Internal error.",
			error_cause_type: "DatabaseError",
			error_message: 'select "id" from "user" where "id" = $1',
			error_type: "DrizzleQueryError",
		});
		expect(buildOperationalErrorFields(normalized).error_stack).not.toContain("user_123");
	});

	it("passes non-drizzle errors through unchanged", () => {
		const error = new Error("plain failure");

		expect(normalizeCapturedError(error)).toBe(error);
	});

	it("bounds error messages before logging them", () => {
		const fields = buildOperationalErrorFields(new Error("x".repeat(2_000)));

		expect(fields.error_message).toHaveLength(1_000);
	});
});
