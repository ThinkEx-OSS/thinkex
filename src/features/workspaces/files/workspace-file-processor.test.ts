import { beforeEach, describe, expect, it, vi } from "vitest";

import { requestWorkspaceFileProcessor } from "#/features/workspaces/files/workspace-file-processor";

const getRandom = vi.hoisted(() => vi.fn());

vi.mock("@cloudflare/containers", () => ({
	Container: class {},
	getRandom,
}));

describe("requestWorkspaceFileProcessor", () => {
	beforeEach(() => {
		getRandom.mockReset();
	});

	it("declares a known content length so Workers can stream the R2 body", async () => {
		const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		getRandom.mockResolvedValue({
			fetch,
			startAndWaitForPorts: vi.fn().mockResolvedValue(undefined),
		});

		await requestWorkspaceFileProcessor({} as Cloudflare.Env, {
			body: streamOf(new Uint8Array([1, 2, 3])),
			contentType: "application/pdf",
			path: "/preview/pdf",
			sizeBytes: 3,
		});

		expect(fetch).toHaveBeenCalledOnce();
		const request = fetch.mock.calls[0]![0] as Request;
		expect(request.headers.get("content-length")).toBe("3");
		expect(request.headers.get("x-file-size")).toBe("3");
		expect(request.headers.get("content-type")).toBe("application/pdf");
	});

	it("encodes the optional file name header", async () => {
		const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
		getRandom.mockResolvedValue({
			fetch,
			startAndWaitForPorts: vi.fn().mockResolvedValue(undefined),
		});

		await requestWorkspaceFileProcessor({} as Cloudflare.Env, {
			body: streamOf(new Uint8Array([1])),
			contentType: "image/png",
			fileName: "my file.png",
			path: "/preview/image",
			sizeBytes: 1,
		});

		const request = fetch.mock.calls[0]![0] as Request;
		expect(request.headers.get("x-file-name")).toBe("my%20file.png");
	});
});

function streamOf(bytes: Uint8Array) {
	const body = new Response(bytes.slice().buffer).body;

	if (!body) {
		throw new Error("Test stream was not created.");
	}

	return body;
}
