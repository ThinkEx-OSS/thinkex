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
			expectedSourceHash: "etag-1",
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
				expectedSourceHash: "etag-1",
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
				expectedSourceHash: "etag-1",
				manifestObjectKey: reference.manifestObjectKey,
				pages: "1-21",
			}),
		).rejects.toMatchObject({ code: "page_selection_too_large" });
	});

	it("consumes each R2 response body before opening the next page", async () => {
		const storage = createObjectStorage();
		const reference = await writeWorkspacePageProjection({
			bucket: storage.bucket,
			itemId: "item-1",
			pages: Array.from({ length: 20 }, (_, index) => ({
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

		await readWorkspacePageProjection({
			bucket: storage.bucket,
			expectedSourceHash: "etag-1",
			manifestObjectKey: reference.manifestObjectKey,
			pages: "1-20",
		});

		expect(storage.maxOpenBodies()).toBe(1);
		expect(storage.openBodies()).toBe(0);
	});

	it("rejects oversized selections before opening page objects when sizes are published", async () => {
		const storage = createObjectStorage();
		const reference = await writeWorkspacePageProjection({
			bucket: storage.bucket,
			itemId: "item-1",
			pages: Array.from({ length: 3 }, (_, index) => ({
				pageNumber: index + 1,
				markdown: "x".repeat(800_000),
			})),
			provider: "liteparse",
			providerMode: "fast",
			runId: "run-1",
			sourceHash: "etag-1",
			tier: "fast",
			workspaceId: "workspace-1",
		});

		storage.readKeys.length = 0;
		await expect(
			readWorkspacePageProjection({
				bucket: storage.bucket,
				expectedSourceHash: "etag-1",
				manifestObjectKey: reference.manifestObjectKey,
				pages: "1-3",
			}),
		).rejects.toMatchObject({ code: "page_selection_too_large" });
		expect(storage.readKeys).toEqual([reference.manifestObjectKey]);
	});

	it("reads projections published before per-page sizes were added", async () => {
		const storage = createObjectStorage();
		const reference = await writeWorkspacePageProjection({
			bucket: storage.bucket,
			itemId: "item-1",
			pages: [{ pageNumber: 1, markdown: "Page 1" }],
			provider: "liteparse",
			providerMode: "fast",
			runId: "run-1",
			sourceHash: "etag-1",
			tier: "fast",
			workspaceId: "workspace-1",
		});
		const { pages: _pages, ...manifestWithoutPages } = reference.manifest;
		storage.values.set(
			reference.manifestObjectKey,
			JSON.stringify({ ...manifestWithoutPages, schemaVersion: 1 }),
		);

		await expect(
			readWorkspacePageProjection({
				bucket: storage.bucket,
				expectedSourceHash: "etag-1",
				manifestObjectKey: reference.manifestObjectKey,
			}),
		).resolves.toEqual({
			content: "## Page 1\n\nPage 1",
			pages: { requested: "1", returned: [1], total: 1 },
		});
	});

	it("preserves extracted Markdown whitespace", async () => {
		const storage = createObjectStorage();
		const markdown = "    indented code  \n\ntrailing hard break  \n";
		const reference = await writeWorkspacePageProjection({
			bucket: storage.bucket,
			itemId: "item-1",
			pages: [{ pageNumber: 1, markdown }],
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
				expectedSourceHash: "etag-1",
				manifestObjectKey: reference.manifestObjectKey,
			}),
		).resolves.toEqual({
			content: `## Page 1\n\n${markdown}`,
			pages: { requested: "1", returned: [1], total: 1 },
		});
	});

	it("resolves to an empty projection when a PDF has no extractable text", async () => {
		const storage = createObjectStorage();
		const reference = await writeWorkspacePageProjection({
			bucket: storage.bucket,
			itemId: "item-1",
			pages: [
				{ pageNumber: 1, markdown: "" },
				{ pageNumber: 2, markdown: "" },
			],
			provider: "liteparse",
			providerMode: "fast",
			runId: "run-1",
			sourceHash: "etag-1",
			tier: "fast",
			workspaceId: "workspace-1",
		});

		expect(reference.hasExtractableText).toBe(false);
		expect(reference.manifest.hasExtractableText).toBe(false);
		expect(reference.manifest.markdownLength).toBe(0);
		expect(reference.manifest.pageCount).toBe(2);

		await expect(
			readWorkspacePageProjection({
				bucket: storage.bucket,
				expectedSourceHash: "etag-1",
				manifestObjectKey: reference.manifestObjectKey,
				pages: "1-2",
			}),
		).resolves.toEqual({
			content: "## Page 1\n\n## Page 2",
			pages: { requested: "1-2", returned: [1, 2], total: 2 },
		});
	});

	it("flags projections that contain extractable text", async () => {
		const storage = createObjectStorage();
		const reference = await writeWorkspacePageProjection({
			bucket: storage.bucket,
			itemId: "item-1",
			pages: [{ pageNumber: 1, markdown: "First" }],
			provider: "liteparse",
			providerMode: "fast",
			runId: "run-1",
			sourceHash: "etag-1",
			tier: "fast",
			workspaceId: "workspace-1",
		});

		expect(reference.hasExtractableText).toBe(true);
		expect(reference.manifest.hasExtractableText).toBe(true);
	});

	it("rejects extractions that produce no pages at all", async () => {
		const storage = createObjectStorage();

		await expect(
			writeWorkspacePageProjection({
				bucket: storage.bucket,
				itemId: "item-1",
				pages: [],
				provider: "liteparse",
				providerMode: "fast",
				runId: "run-1",
				sourceHash: "etag-1",
				tier: "fast",
				workspaceId: "workspace-1",
			}),
		).rejects.toThrow("Extraction did not produce any pages.");
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
	let currentOpenBodies = 0;
	let highestOpenBodies = 0;
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
			currentOpenBodies += 1;
			highestOpenBodies = Math.max(highestOpenBodies, currentOpenBodies);
			let consumed = false;
			const consume = () => {
				if (!consumed) {
					consumed = true;
					currentOpenBodies -= 1;
				}
			};
			return {
				body: { cancel: async () => consume() },
				key,
				size: new TextEncoder().encode(value).byteLength,
				text: async () => {
					consume();
					return value;
				},
				json: async () => {
					consume();
					return JSON.parse(value) as unknown;
				},
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

	return {
		bucket,
		openBodies: () => currentOpenBodies,
		maxOpenBodies: () => highestOpenBodies,
		readKeys,
		values,
	};
}
