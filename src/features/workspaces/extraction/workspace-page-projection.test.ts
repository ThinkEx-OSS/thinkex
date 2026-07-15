import { describe, expect, it } from "vitest";

import {
	getWorkspacePageObjectKey,
	readWorkspacePageProjection,
	writeWorkspacePageProjection,
} from "#/features/workspaces/extraction/workspace-page-projection";

describe("workspace page projections", () => {
	it("publishes immutable page objects and reads only selected pages", async () => {
		const storage = createObjectStorage();
		const reference = await writeWorkspacePageProjection({
			bucket: storage.bucket,
			itemId: "item-1",
			pages: [
				{ pageNumber: 1, markdown: "First" },
				{ pageNumber: 2, markdown: "Second" },
				{ pageNumber: 3, markdown: "Third" },
			],
			provider: "liteparse",
			providerMode: "fast",
			runId: "run-1",
			sourceHash: "etag-1",
			tier: "fast",
			workspaceId: "workspace-1",
		});

		storage.readKeys.length = 0;
		const result = await readWorkspacePageProjection({
			bucket: storage.bucket,
			manifestObjectKey: reference.manifestObjectKey,
			pages: "2-3",
		});

		expect(result).toEqual({
			content: "## Page 2\n\nSecond\n\n## Page 3\n\nThird",
			pages: { requested: "2-3", returned: [2, 3], total: 3 },
		});
		const prefix = reference.manifestObjectKey.slice(0, -"manifest.json".length);
		expect(storage.readKeys).toEqual([
			reference.manifestObjectKey,
			getWorkspacePageObjectKey(prefix, 2),
			getWorkspacePageObjectKey(prefix, 3),
		]);
	});

	it("preserves missing page numbers as blank pages", async () => {
		const storage = createObjectStorage();
		const reference = await writeWorkspacePageProjection({
			bucket: storage.bucket,
			itemId: "item-1",
			pages: [
				{ pageNumber: 1, markdown: "First" },
				{ pageNumber: 3, markdown: "Third" },
			],
			provider: "llama_parse",
			providerMode: "agentic",
			runId: "run-1",
			sourceHash: "etag-1",
			tier: "enhanced",
			workspaceId: "workspace-1",
		});

		await expect(
			readWorkspacePageProjection({
				bucket: storage.bucket,
				manifestObjectKey: reference.manifestObjectKey,
				pages: "2",
			}),
		).resolves.toEqual({
			content: "## Page 2",
			pages: { requested: "2", returned: [2], total: 3 },
		});
	});

	it("bounds page reads", async () => {
		const storage = createObjectStorage();
		const reference = await writeWorkspacePageProjection({
			bucket: storage.bucket,
			itemId: "item-1",
			pages: Array.from({ length: 21 }, (_, index) => ({
				pageNumber: index + 1,
				markdown: `Page ${index + 1}`,
			})),
			provider: "liteparse",
			providerMode: "fast",
			runId: "run-1",
			sourceHash: "etag-1",
			tier: "fast",
			workspaceId: "workspace-1",
		});

		await expect(
			readWorkspacePageProjection({
				bucket: storage.bucket,
				manifestObjectKey: reference.manifestObjectKey,
				pages: "1-21",
			}),
		).rejects.toMatchObject({ code: "page_selection_too_large" });
	});

	it("rejects oversized page numbers before writing page gaps", async () => {
		const storage = createObjectStorage();

		await expect(
			writeWorkspacePageProjection({
				bucket: storage.bucket,
				itemId: "item-1",
				pages: [{ pageNumber: 2_001, markdown: "Too far" }],
				provider: "liteparse",
				providerMode: "fast",
				runId: "run-1",
				sourceHash: "etag-1",
				tier: "fast",
				workspaceId: "workspace-1",
			}),
		).rejects.toThrow("Extraction exceeds the 2000-page limit.");
		expect(storage.values.size).toBe(0);
	});

	it("removes partial artifacts when publication fails", async () => {
		const storage = createObjectStorage();

		await expect(
			writeWorkspacePageProjection({
				bucket: storage.bucket,
				itemId: "item-1",
				pages: [
					{ pageNumber: 1, markdown: "First" },
					{ pageNumber: 1, markdown: "Duplicate" },
				],
				provider: "liteparse",
				providerMode: "fast",
				runId: "run-1",
				sourceHash: "etag-1",
				tier: "fast",
				workspaceId: "workspace-1",
			}),
		).rejects.toThrow("Extracted pages must be ordered");
		expect(storage.values.size).toBe(0);
	});
});

function createObjectStorage() {
	const values = new Map<string, string>();
	const readKeys: string[] = [];
	const bucket = {
		async delete(keys: string | string[]) {
			for (const key of Array.isArray(keys) ? keys : [keys]) {
				values.delete(key);
			}
		},
		async get(key: string) {
			readKeys.push(key);
			const value = values.get(key);
			if (value === undefined) {
				return null;
			}
			return {
				key,
				size: new TextEncoder().encode(value).byteLength,
				text: async () => value,
				json: async () => JSON.parse(value) as unknown,
			};
		},
		async put(key: string, value: string) {
			values.set(key, value);
			return { key, size: new TextEncoder().encode(value).byteLength };
		},
		async list(input: { prefix?: string }) {
			const objects = Array.from(values.keys())
				.filter((key) => key.startsWith(input.prefix ?? ""))
				.map((key) => ({ key }));
			return { objects, truncated: false };
		},
	} as R2Bucket;

	return { bucket, readKeys, values };
}
