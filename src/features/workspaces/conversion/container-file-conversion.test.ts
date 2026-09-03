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

		expect(new Uint8Array(await new Response(response.body).arrayBuffer())).toEqual(output);
		expect(container.startAndWaitForPorts).toHaveBeenCalledOnce();
	});

	it("propagates a failed conversion response", async () => {
		const container = createContainer(new Response("converter unavailable", { status: 503 }));

		await expect(convert(container)).rejects.toThrow(
			"File conversion failed with status 503. converter unavailable",
		);
	});

	it("retries a queue-full response and succeeds", async () => {
		const output = new Uint8Array([7, 8, 9]);
		const container = createSequencedContainer([queueFullResponse(), sizedResponse(output)]);

		const response = await convert(container);

		expect(new Uint8Array(await new Response(response.body).arrayBuffer())).toEqual(output);
		expect(container.fetch).toHaveBeenCalledTimes(2);
	});

	it("gives up after exhausting queue-full retries", async () => {
		const container = createSequencedContainer(
			Array.from({ length: 8 }, () => queueFullResponse()),
		);

		await expect(convert(container)).rejects.toThrow("File conversion failed with status 429");
		// One initial attempt plus three retries.
		expect(container.fetch).toHaveBeenCalledTimes(4);
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

function createContainer(output: Response | Uint8Array) {
	return {
		fetch: vi.fn(async (request: Request) => {
			await request.arrayBuffer();
			return output instanceof Response ? output : sizedResponse(output);
		}),
		startAndWaitForPorts: vi.fn(async () => undefined),
	};
}

function createSequencedContainer(responses: Response[]) {
	let index = 0;
	return {
		fetch: vi.fn(async (request: Request) => {
			await request.arrayBuffer();
			return responses[Math.min(index++, responses.length - 1)];
		}),
		startAndWaitForPorts: vi.fn(async () => undefined),
	};
}

function sizedResponse(bytes: Uint8Array) {
	return new Response(bytes.slice().buffer, {
		headers: { "content-length": String(bytes.byteLength) },
	});
}

// A "retry-after: 0" hint keeps the retry loop instant under test.
function queueFullResponse() {
	return new Response("queue full", { status: 429, headers: { "retry-after": "0" } });
}

function stream(bytes: Uint8Array) {
	const body = new Response(bytes.slice().buffer).body;
	if (!body) {
		throw new Error("Test stream was not created.");
	}
	return body;
}
