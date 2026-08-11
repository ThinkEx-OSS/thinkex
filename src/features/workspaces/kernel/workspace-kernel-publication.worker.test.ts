import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { getWorkspaceFileItemObjectPrefix } from "#/features/workspaces/files/workspace-file-object-keys";
import { getWorkspaceKernelShellPath } from "#/features/workspaces/kernel/workspace-kernel-files";
import type { WorkspaceKernel } from "#/features/workspaces/kernel/workspace-kernel";

function getKernelStub(workspaceId: string) {
	const namespace = Reflect.get(env as object, "WorkspaceKernel") as DurableObjectNamespace;

	return namespace.get(namespace.idFromName(workspaceId)) as DurableObjectStub<WorkspaceKernel>;
}

describe("workspace kernel publication", () => {
	it("treats repeated item deletion as already done", async () => {
		const workspaceId = crypto.randomUUID();
		const itemId = crypto.randomUUID();
		const stub = getKernelStub(workspaceId);

		await runInDurableObject(stub, async (kernel: WorkspaceKernel) => {
			await kernel.createItem({ id: itemId, type: "document", name: "Draft" });
			await kernel.deleteItems({ itemIds: [itemId] });

			await expect(kernel.deleteItems({ itemIds: [itemId] })).resolves.toMatchObject({
				result: {
					deletedItemIds: [],
					itemIds: [],
				},
			});
		});
	});

	it("discards a file projection when deletion wins during R2 validation", async () => {
		const workspaceId = crypto.randomUUID();
		const itemId = crypto.randomUUID();
		const prefix = getWorkspaceFileItemObjectPrefix({ workspaceId, itemId });
		const sourceKey = `${prefix}source.pdf`;
		const previewKey = `${prefix}preview.pdf`;
		const manifestKey = `${prefix}extractions/test/enhanced/manifest.json`;
		const source = await env.WORKSPACE_KERNEL_FILES.put(sourceKey, "source");
		if (!source) {
			throw new Error("Failed to stage the test source object.");
		}
		await Promise.all([
			env.WORKSPACE_KERNEL_FILES.put(previewKey, "preview"),
			env.WORKSPACE_KERNEL_FILES.put(manifestKey, "manifest"),
		]);
		const stub = getKernelStub(workspaceId);

		await runInDurableObject(stub, async (kernel: WorkspaceKernel) => {
			await kernel.createFileFromUpload({
				assetKind: "pdf",
				fileName: "source.pdf",
				fileSize: source.size,
				id: itemId,
				objectKey: sourceKey,
				preview: {
					objectKey: previewKey,
					sizeBytes: 7,
					sourceHash: source.etag,
				},
			});

			const fileCommands = Reflect.get(kernel as object, "fileCommands") as object;
			const bucket = Reflect.get(fileCommands, "r2") as R2Bucket;
			const delayedHead = delayFirstCall(bucket, "head");
			Reflect.set(fileCommands, "r2", delayedHead.proxy);

			const publication = kernel.upsertFileProjection({
				format: "pages",
				itemId,
				objectKey: manifestKey,
				sourceHash: source.etag,
				status: "ready",
			});
			await delayedHead.started;
			await kernel.deleteItems({ itemIds: [itemId] });
			await env.WORKSPACE_KERNEL_FILES.put(manifestKey, "late manifest");
			delayedHead.resume();

			await expect(publication).resolves.toBe("discarded");
			expect((await kernel.getPage()).revision).toBe(2);
		});

		await env.WORKSPACE_KERNEL_FILES.delete(manifestKey);
		expect(await env.WORKSPACE_KERNEL_FILES.head(manifestKey)).toBeNull();
	});

	it("removes a document checkpoint written after deletion", async () => {
		const workspaceId = crypto.randomUUID();
		const itemId = crypto.randomUUID();
		const shellPath = getWorkspaceKernelShellPath({ id: itemId, type: "document" });
		const stub = getKernelStub(workspaceId);

		await runInDurableObject(stub, async (kernel: WorkspaceKernel) => {
			await kernel.createItem({ id: itemId, type: "document", name: "Draft" });
			const itemCommands = Reflect.get(kernel as object, "itemCommands") as object;
			const workspace = Reflect.get(itemCommands, "workspace") as {
				readFile(path: string): Promise<string>;
				writeFile(path: string, content: string, contentType?: string): Promise<void>;
			};
			const delayedWrite = delayFirstCall(workspace, "writeFile");
			Reflect.set(itemCommands, "workspace", delayedWrite.proxy);

			const checkpoint = kernel.commitItemContent({
				content: '{"type":"doc","content":[]}',
				itemId,
			});
			await delayedWrite.started;
			await kernel.deleteItems({ itemIds: [itemId] });
			delayedWrite.resume();

			await expect(checkpoint).resolves.toEqual({ status: "discarded" });
			await expect(workspace.readFile(shellPath)).resolves.toBeNull();
		});
	});

	it("keeps exact before and after bodies for a required content version", async () => {
		const workspaceId = crypto.randomUUID();
		const itemId = crypto.randomUUID();
		const versionId = crypto.randomUUID();
		const before = '{"type":"doc","content":[]}';
		const after = '{"type":"doc","content":[{"type":"paragraph"}]}';
		const stub = getKernelStub(workspaceId);

		await runInDurableObject(stub, async (kernel: WorkspaceKernel) => {
			await kernel.createItem({
				id: itemId,
				initialContent: before,
				name: "Draft",
				type: "document",
			});
			await expect(
				kernel.commitItemContent({
					content: after,
					createVersion: true,
					itemId,
					versionId,
				}),
			).resolves.toMatchObject({ status: "applied", versionId });

			await expect(
				kernel.readItemVersionChange({ versionIds: [versionId] }),
			).resolves.toMatchObject({ beforeContent: before, status: "ready" });
			await expect(kernel.readItemVersion({ itemId, versionId })).resolves.toMatchObject({
				beforeContent: before,
				content: after,
				status: "ready",
			});
		});
	});

	it("promotes an already-saved document into an idle version", async () => {
		const workspaceId = crypto.randomUUID();
		const itemId = crypto.randomUUID();
		const versionId = crypto.randomUUID();
		const before = '{"type":"doc","content":[]}';
		const after = '{"type":"doc","content":[{"type":"paragraph"}]}';
		const stub = getKernelStub(workspaceId);

		await runInDurableObject(stub, async (kernel: WorkspaceKernel) => {
			await kernel.createItem({
				id: itemId,
				initialContent: before,
				name: "Draft",
				type: "document",
			});
			await expect(
				kernel.commitItemContent({
					content: after,
					itemId,
					provenance: { origin: "human" },
				}),
			).resolves.toMatchObject({ status: "applied", versionId: null });
			await expect(
				kernel.commitItemContent({
					content: after,
					createVersion: true,
					itemId,
					provenance: { origin: "human" },
					versionId,
				}),
			).resolves.toMatchObject({ status: "applied", versionId });
			await expect(kernel.readItemVersion({ itemId, versionId })).resolves.toMatchObject({
				beforeContent: before,
				content: after,
				status: "ready",
			});
			await expect(
				kernel.readItemVersionChange({ versionIds: [versionId] }),
			).resolves.toMatchObject({ beforeContent: before, status: "ready" });
		});
	});

	it("retains document versions after the item is deleted", async () => {
		const workspaceId = crypto.randomUUID();
		const itemId = crypto.randomUUID();
		const versionId = crypto.randomUUID();
		const before = '{"type":"doc","content":[]}';
		const after = '{"type":"doc","content":[{"type":"paragraph"}]}';
		const stub = getKernelStub(workspaceId);

		await runInDurableObject(stub, async (kernel: WorkspaceKernel) => {
			await kernel.createItem({
				id: itemId,
				initialContent: before,
				name: "Draft",
				type: "document",
			});
			await kernel.commitItemContent({ content: after, createVersion: true, itemId, versionId });
			await kernel.deleteItems({ itemIds: [itemId] });

			await expect(kernel.readItemVersion({ itemId, versionId })).resolves.toMatchObject({
				beforeContent: before,
				canRestore: false,
				content: after,
				status: "ready",
			});
		});
	});
});

function delayFirstCall<T extends object>(target: T, method: PropertyKey) {
	const started = createGate();
	const resume = createGate();
	let delayed = false;

	return {
		proxy: new Proxy(target, {
			get(currentTarget, property) {
				const value = Reflect.get(currentTarget, property);
				if (typeof value !== "function") {
					return value;
				}
				if (property !== method) {
					return value.bind(currentTarget);
				}

				return async (...args: unknown[]) => {
					if (!delayed) {
						delayed = true;
						started.open();
						await resume.wait;
					}
					return Reflect.apply(value, currentTarget, args);
				};
			},
		}),
		resume: resume.open,
		started: started.wait,
	};
}

function createGate() {
	let open: () => void = () => {};
	const wait = new Promise<void>((resolve) => {
		open = resolve;
	});

	return { open, wait };
}
