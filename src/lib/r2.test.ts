import { beforeAll, describe, expect, it, vi } from "vitest";

import { deleteR2Prefix, putFixedLengthR2Object } from "#/lib/r2";

const fixedLengthSizes: number[] = [];

beforeAll(() => {
	vi.stubGlobal(
		"FixedLengthStream",
		class {
			readonly readable: ReadableStream<Uint8Array>;
			readonly writable: WritableStream<Uint8Array>;

			constructor(sizeBytes: number) {
				fixedLengthSizes.push(sizeBytes);
				const stream = new TransformStream<Uint8Array, Uint8Array>();
				this.readable = stream.readable;
				this.writable = stream.writable;
			}
		},
	);
});

describe("R2 helpers", () => {
	it("stores a source through a fixed-length stream", async () => {
		fixedLengthSizes.length = 0;
		const bytes = new Uint8Array([1, 2, 3]);
		let stored: Uint8Array | null = null;
		const bucket = {
			async put(_key: string, body: ReadableStream<Uint8Array>) {
				stored = new Uint8Array(await new Response(body).arrayBuffer());
				return { size: stored.byteLength } as R2Object;
			},
		} as R2Bucket;

		await putFixedLengthR2Object(bucket, "file", {
			body: new Response(bytes.slice().buffer).body!,
			sizeBytes: bytes.byteLength,
		});

		expect(stored).toEqual(bytes);
		expect(fixedLengthSizes).toEqual([bytes.byteLength]);
	});

	it("deletes every page of an object prefix", async () => {
		const keys = new Set([
			...Array.from({ length: 1_500 }, (_, index) => `target/${index}`),
			"other/keep",
		]);
		const bucket = {
			async delete(input: string | string[]) {
				for (const key of Array.isArray(input) ? input : [input]) {
					keys.delete(key);
				}
			},
			async list(input: { limit?: number; prefix?: string }) {
				const objects = Array.from(keys)
					.filter((key) => key.startsWith(input.prefix ?? ""))
					.slice(0, input.limit)
					.map((key) => ({ key }));
				return {
					objects,
					truncated: objects.length === input.limit,
				};
			},
		} as unknown as R2Bucket;

		await deleteR2Prefix(bucket, "target/");

		expect(keys).toEqual(new Set(["other/keep"]));
	});
});
