import { beforeEach, describe, expect, it, vi } from "vitest";

const recordOperationalOutcome = vi.fn();
const capturePostHogServerEvent = vi.fn();

vi.mock("#/integrations/observability/operational-events", () => ({
	recordOperationalOutcome: (input: unknown) => recordOperationalOutcome(input),
}));
vi.mock("#/integrations/posthog/server", () => ({
	capturePostHogServerEvent: (input: unknown) => capturePostHogServerEvent(input),
}));
vi.mock("#/integrations/posthog/server-context", () => ({
	getTelemetryRequestDetails: () => ({}),
	getTelemetryRequestContext: () => ({ properties: {} }),
}));

const { observeWorkspaceFileIntake } =
	await import("#/features/workspaces/upload/workspace-file-intake-observability");

function uploadRequest() {
	return new Request("https://thinkex.test/api/v1/workspaces/w1/file-upload", { method: "POST" });
}

describe("observeWorkspaceFileIntake", () => {
	beforeEach(() => {
		recordOperationalOutcome.mockClear();
		capturePostHogServerEvent.mockClear();
	});

	it("counts a client rejection but keeps it out of exception capture", async () => {
		await observeWorkspaceFileIntake({
			kind: "workspace_file",
			request: uploadRequest(),
			requestId: "req-1",
			workspaceId: "w1",
			run: (observation) => {
				observation.error = new Error("This PDF is damaged or invalid.");
				return Promise.resolve(new Response("rejected", { status: 422 }));
			},
		});

		const outcome = recordOperationalOutcome.mock.calls[0][0];
		expect(outcome.outcome).toBe("rejected");
		expect(outcome.error).toBeUndefined();
		expect(capturePostHogServerEvent).toHaveBeenCalledTimes(1);
	});

	it("forwards a genuine server failure to exception capture", async () => {
		const error = new Error("Workspace file processor failed.");
		await observeWorkspaceFileIntake({
			kind: "workspace_file",
			request: uploadRequest(),
			requestId: "req-2",
			workspaceId: "w1",
			run: (observation) => {
				observation.error = error;
				return Promise.resolve(new Response("boom", { status: 500 }));
			},
		});

		const outcome = recordOperationalOutcome.mock.calls[0][0];
		expect(outcome.outcome).toBe("error");
		expect(outcome.error).toBe(error);
	});

	it("labels a completed upload as a success", async () => {
		await observeWorkspaceFileIntake({
			kind: "workspace_file",
			request: uploadRequest(),
			requestId: "req-3",
			workspaceId: "w1",
			run: () => Promise.resolve(new Response("ok", { status: 200 })),
		});

		const outcome = recordOperationalOutcome.mock.calls[0][0];
		expect(outcome.outcome).toBe("success");
		expect(outcome.error).toBeUndefined();
	});
});
