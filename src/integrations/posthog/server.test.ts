import { describe, expect, it, vi } from "vitest";

import { getTelemetryRequestContext } from "#/integrations/posthog/server-context";

vi.mock("@tanstack/react-start/server", () => ({
	getRequestHeaders: () => {
		throw new Error("No StartEvent found in AsyncLocalStorage.");
	},
}));

vi.mock("cloudflare:workers", () => ({
	env: { CF_VERSION_METADATA: { id: "v1", tag: "tag", timestamp: "2026-08-07T00:00:00.000Z" } },
}));

describe("telemetry context outside a request", () => {
	// Captures happen inline on the paths they measure, so reaching for request scope
	// where there is none — a Durable Object, Workflow, or alarm — turned a telemetry
	// gap into a user-visible read failure in production.
	it("only reads request scope when a request was supplied", async () => {
		expect(() => getTelemetryRequestContext()).toThrow("AsyncLocalStorage");

		const { capturePostHogServerEvent } = await import("#/integrations/posthog/server");

		expect(() =>
			capturePostHogServerEvent({
				consentExempt: true,
				distinctId: "workspace-1",
				event: "workspace_file_read_completed",
				properties: { operation_id: "op-1", status: "ready", workspace_id: "workspace-1" },
			}),
		).not.toThrow();
	});
});
