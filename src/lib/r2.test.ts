import { describe, expect, it } from "vitest";

import { deleteR2Prefix } from "#/lib/r2";

describe("R2 helpers", () => {
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
