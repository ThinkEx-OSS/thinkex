import { beforeAll, describe, expect, it, vi } from "vitest";

import { convertFileStreamWithContainer } from "#/features/workspaces/conversion/container-file-conversion";

beforeAll(() => {
	vi.stubGlobal(
		"FixedLengthStream",
		class {
			readonly readable: ReadableStream<Uint8Array>;
			readonly writable: WritableStream<Uint8Array>;

			constructor() {
				const stream = new TransformStream<Uint8Array, Uint8Array>();
				this.readable = stream.readable;
				this.writable = stream.writable;
			}
		},
	);
});

describe("container file conversion", () => {
	it("rejects an empty successful conversion response", async () => {
		const container = createContainer(new Uint8Array());

		await expect(convert(container)).rejects.toThrow("Conversion returned no content");
	});

	it("preserves a non-empty conversion response", async () => {
		const output = new Uint8Array([4, 5, 6]);
		const container = createContainer(output);

		const response = await convert(container);

		expect(new Uint8Array(await response.arrayBuffer())).toEqual(output);
		expect(container.startAndWaitForPorts).toHaveBeenCalledOnce();
	});
});

function convert(container: ReturnType<typeof createContainer>) {
	return convertFileStreamWithContainer({
		body: stream(new Uint8Array([1, 2, 3])),
		container,
		contentType: "application/octet-stream",
		emptyMessage: "Conversion returned no content",
		error: (message) => new Error(message),
		fileName: "input.bin",
		formFieldName: "file",
		sizeBytes: 3,
		url: "http://container/convert",
	});
}

function createContainer(output: Uint8Array) {
	return {
		fetch: vi.fn(async (request: Request) => {
			await request.arrayBuffer();
			return new Response(output.slice().buffer);
		}),
		startAndWaitForPorts: vi.fn(async () => undefined),
	};
}

function stream(bytes: Uint8Array) {
	const body = new Response(bytes.slice().buffer).body;
	if (!body) {
		throw new Error("Test stream was not created.");
	}
	return body;
}
