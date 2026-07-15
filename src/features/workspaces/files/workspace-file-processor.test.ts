import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getRandom = vi.hoisted(() => vi.fn());

vi.mock("@cloudflare/containers", () => ({
	Container: class {},
	getRandom,
}));

import { requestWorkspaceFileProcessor } from "#/features/workspaces/files/workspace-file-processor";

const startAndWaitForPorts = vi.fn();
const fetch = vi.fn();

describe("requestWorkspaceFileProcessor", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		getRandom.mockReset();
		startAndWaitForPorts.mockReset();
		fetch.mockReset();
		getRandom.mockResolvedValue({ fetch, startAndWaitForPorts });
		fetch.mockResolvedValue(new Response("ok"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("retries provisioning when no container instance is available yet", async () => {
		startAndWaitForPorts
			.mockRejectedValueOnce(
				new Error("there is no container instance that can be provided to this durable object"),
			)
			.mockResolvedValueOnce(undefined);

		const promise = requestWorkspaceFileProcessor(env(), input());
		await vi.runAllTimersAsync();
		const response = await promise;

		expect(await response.text()).toBe("ok");
		expect(startAndWaitForPorts).toHaveBeenCalledTimes(2);
		expect(fetch).toHaveBeenCalledOnce();
	});

	it("does not retry errors unrelated to provisioning", async () => {
		startAndWaitForPorts.mockRejectedValue(new Error("port ready timeout"));

		await expect(requestWorkspaceFileProcessor(env(), input())).rejects.toThrow(
			"port ready timeout",
		);
		expect(startAndWaitForPorts).toHaveBeenCalledOnce();
		expect(fetch).not.toHaveBeenCalled();
	});

	it("gives up after exhausting provisioning retries", async () => {
		startAndWaitForPorts.mockRejectedValue(
			new Error("there is no container instance that can be provided to this durable object"),
		);

		const promise = requestWorkspaceFileProcessor(env(), input());
		const settled = expect(promise).rejects.toThrow("no container instance");
		await vi.runAllTimersAsync();
		await settled;

		expect(startAndWaitForPorts).toHaveBeenCalledTimes(4);
		expect(fetch).not.toHaveBeenCalled();
	});
});

function env(): Cloudflare.Env {
	return { WORKSPACE_FILE_PROCESSOR: {} } as unknown as Cloudflare.Env;
}

function input() {
	const body = new Response(new Uint8Array([1, 2, 3]).buffer).body;

	if (!body) {
		throw new Error("Test stream was not created.");
	}

	return {
		body,
		contentType: "application/pdf",
		path: "/preview/pdf" as const,
		sizeBytes: 3,
	};
}
