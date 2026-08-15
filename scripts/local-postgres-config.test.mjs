import { describe, expect, it } from "vitest";

import { getLocalPostgresConfig, resolveLocalDatabase } from "./local-postgres-config.mjs";

describe("getLocalPostgresConfig", () => {
	it("defaults to port 3000 when CONDUCTOR_PORT is unset", () => {
		expect(getLocalPostgresConfig({})).toMatchObject({
			databaseName: "thinkex_3000",
			port: "3000",
			roleName: "thinkex_local_3000",
		});
	});

	it("appends a normalized workspace id so a reused port cannot inherit another workspace", () => {
		expect(
			getLocalPostgresConfig({ CONDUCTOR_PORT: "55000", CONDUCTOR_WORKSPACE_ID: "AbC-123" }),
		).toMatchObject({ databaseName: "thinkex_55000_abc123" });
	});

	it("rejects a port that is not a valid TCP port", () => {
		expect(() => getLocalPostgresConfig({ CONDUCTOR_PORT: "70000" })).toThrow();
		expect(() => getLocalPostgresConfig({ CONDUCTOR_PORT: "nope" })).toThrow();
	});
});

// clean-local-dev.mjs decides what is safe to drop from this function's answer,
// so each case below is the difference between keeping and deleting a database
// somebody is using.
describe("resolveLocalDatabase", () => {
	it("uses the derived database when no connection string is preset", () => {
		expect(resolveLocalDatabase({})).toMatchObject({
			databaseName: "thinkex_3000",
			isConfigured: false,
		});
	});

	it("prefers a preset connection string over the derived name", () => {
		expect(
			resolveLocalDatabase({
				CONDUCTOR_PORT: "55000",
				CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
					"postgresql://user:pass@localhost:5432/thinkex_9999",
			}),
		).toMatchObject({
			databaseName: "thinkex_9999",
			url: "postgresql://user:pass@localhost:5432/thinkex_9999",
			isConfigured: true,
		});
	});

	it("ignores query parameters when reading the database name", () => {
		expect(
			resolveLocalDatabase({
				CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
					"postgresql://user:pass@localhost:5432/thinkex_9999?sslmode=require",
			}),
		).toMatchObject({ databaseName: "thinkex_9999" });
	});

	it("reports no database name for an unparseable connection string, so callers stay hands-off", () => {
		expect(
			resolveLocalDatabase({
				CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: "not-a-url",
			}),
		).toMatchObject({ databaseName: undefined, isConfigured: true });
	});

	it("treats an empty connection string as absent", () => {
		expect(
			resolveLocalDatabase({ CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE: "   " }),
		).toMatchObject({ databaseName: "thinkex_3000", isConfigured: false });
	});
});
