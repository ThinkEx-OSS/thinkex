import { describe, expect, it } from "vitest";

import {
	getWorkspacePageObjectKey,
	publishWorkspacePageProjection,
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
			emptyPages: [],
			pages: { requested: "2-3", returned: [2, 3], total: 3 },
		});
		const prefix = reference.manifestObjectKey.slice(0, -"manifest.json".length);
		// A contiguous selection coalesces into a single ranged read of the packed
		// pages object rather than one request per page.
		expect(storage.readKeys).toEqual([reference.manifestObjectKey, `${prefix}pages.md`]);
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
			emptyPages: [2],
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

	// Projections written before schema version 2 store one object per page and their
	// regeneration is billable, so the read path must keep serving them unmigrated.
	it("reads legacy per-page projections without migration", async () => {
		const storage = createObjectStorage();
		const prefix = "workspace_file_objects/workspace-1/item-1/extractions/run-1/fast/";
		const manifestObjectKey = `${prefix}manifest.json`;
		storage.values.set(getWorkspacePageObjectKey(prefix, 1), "First");
		storage.values.set(getWorkspacePageObjectKey(prefix, 2), "Second");
		storage.values.set(
			manifestObjectKey,
			JSON.stringify({
				createdAt: new Date().toISOString(),
				itemId: "item-1",
				markdownBytes: 11,
				markdownLength: 11,
				metadata: {},
				pageCount: 2,
				pages: [
					{ markdownBytes: 5, pageNumber: 1 },
					{ markdownBytes: 6, pageNumber: 2 },
				],
				provider: "liteparse",
				providerMode: "fast",
				runId: "run-1",
				schemaVersion: 1,
				sourceHash: "etag-1",
				workspaceId: "workspace-1",
			}),
		);

		await expect(
			readWorkspacePageProjection({
				bucket: storage.bucket,
				expectedSourceHash: "etag-1",
				manifestObjectKey,
			}),
		).resolves.toEqual({
			content: "## Page 1\n\nFirst",
			emptyPages: [],
			pages: { requested: "1", returned: [1], total: 2 },
		});
		expect(storage.readKeys).toContain(getWorkspacePageObjectKey(prefix, 1));
	});

	it("reads legacy manifests published before per-page sizes were added", async () => {
		const storage = createObjectStorage();
		const prefix = "workspace_file_objects/workspace-1/item-1/extractions/run-1/fast/";
		const manifestObjectKey = `${prefix}manifest.json`;
		storage.values.set(getWorkspacePageObjectKey(prefix, 1), "Page 1");
		storage.values.set(
			manifestObjectKey,
			JSON.stringify({
				createdAt: new Date().toISOString(),
				itemId: "item-1",
				markdownBytes: 6,
				markdownLength: 6,
				metadata: {},
				pageCount: 1,
				provider: "liteparse",
				providerMode: "fast",
				runId: "run-1",
				schemaVersion: 1,
				sourceHash: "etag-1",
				workspaceId: "workspace-1",
			}),
		);

		await expect(
			readWorkspacePageProjection({
				bucket: storage.bucket,
				expectedSourceHash: "etag-1",
				manifestObjectKey,
			}),
		).resolves.toEqual({
			content: "## Page 1\n\nPage 1",
			emptyPages: [],
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
			emptyPages: [],
			pages: { requested: "1", returned: [1], total: 1 },
		});
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

	it("removes staged artifacts when the kernel discards publication", async () => {
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

		await expect(
			publishWorkspacePageProjection({
				bucket: storage.bucket,
				kernel: {
					async upsertFileProjection() {
						return "discarded" as const;
					},
				},
				projection: {
					format: "pages",
					itemId: "item-1",
					objectKey: reference.manifestObjectKey,
					sourceHash: "etag-1",
					status: "ready",
				},
			}),
		).resolves.toBe("discarded");
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
		async get(key: string, options?: { range?: { offset: number; length: number } }) {
			readKeys.push(key);
			const value = values.get(key);
			if (value === undefined) {
				return null;
			}
			const fullBytes = new TextEncoder().encode(value);
			const bytes = options?.range
				? fullBytes.subarray(options.range.offset, options.range.offset + options.range.length)
				: fullBytes;
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
				size: bytes.byteLength,
				arrayBuffer: async () => {
					consume();
					return bytes.slice().buffer;
				},
				text: async () => {
					consume();
					return new TextDecoder().decode(bytes);
				},
				json: async () => {
					consume();
					return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
				},
			};
		},
		async put(key: string, value: string | Blob) {
			const text = typeof value === "string" ? value : await value.text();
			values.set(key, text);
			return { key, size: new TextEncoder().encode(text).byteLength };
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
