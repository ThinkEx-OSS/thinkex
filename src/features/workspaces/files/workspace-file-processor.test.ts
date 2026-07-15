import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const getRandom = vi.hoisted(() => vi.fn());

vi.mock("@cloudflare/containers", () => ({
	Container: class {},
	getRandom,
}));

import { requestWorkspaceFileProcessor } from "#/features/workspaces/files/workspace-file-processor";

const fixedLengthSizes: number[] = [];

beforeAll(() => {
	vi.stubGlobal(
		"FixedLengthStream",
		class {
			readonly readable: ReadableStream<Uint8Array>;
			readonly writable: WritableStream<Uint8Array>;

			constructor(size: number) {
				fixedLengthSizes.push(size);
				const stream = new TransformStream<Uint8Array, Uint8Array>();
				this.readable = stream.readable;
				this.writable = stream.writable;
			}
		},
	);
});

beforeEach(() => {
	fixedLengthSizes.length = 0;
	getRandom.mockReset();
});

describe("workspace file processor", () => {
	it("forwards the source through a fixed-length request body", async () => {
		const source = new Uint8Array([1, 2, 3]);
		const container = {
			fetch: vi.fn(async (request: Request) => {
				expect(new Uint8Array(await request.arrayBuffer())).toEqual(source);
				return new Response(null, { status: 204 });
			}),
			startAndWaitForPorts: vi.fn(async () => undefined),
		};
		getRandom.mockResolvedValue(container);

		const response = await requestWorkspaceFileProcessor(
			{ WORKSPACE_FILE_PROCESSOR: {} } as Cloudflare.Env,
			{
				body: createStream(source),
				contentType: "application/pdf",
				fileName: "paper.pdf",
				path: "/prepare/pdf",
				sizeBytes: source.byteLength,
			},
		);

		expect(response.status).toBe(204);
		expect(fixedLengthSizes).toEqual([source.byteLength]);
		expect(container.startAndWaitForPorts).toHaveBeenCalledOnce();
		expect(container.fetch).toHaveBeenCalledOnce();
	});
});

function createStream(bytes: Uint8Array) {
	const body = new Response(bytes.slice().buffer).body;
	if (!body) {
		throw new Error("Test stream was not created.");
	}
	return body;
}
