import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";

import {
	readPersistedDocumentYjsUpdate,
	writePersistedDocumentYjsUpdate,
} from "#/features/workspaces/documents/document-yjs-persistence";

const partKeyPrefix = "document-session:yjs-update-part:";

describe("document Yjs persistence", () => {
	it("round-trips a Yjs state over the 2 MB storage value limit", async () => {
		const update = createYjsUpdate(2.5 * 1024 * 1024);
		expect(update.byteLength).toBeGreaterThan(2 * 1024 * 1024);

		await runInSession("large-document", async (storage) => {
			await expect(storage.put("single-value", update)).rejects.toThrow(/SQLITE_TOOBIG/);

			await storage.transaction((transaction) =>
				writePersistedDocumentYjsUpdate(transaction, update),
			);
			const persisted = await readPersistedDocumentYjsUpdate(storage);

			expect(persisted?.byteLength).toBe(update.byteLength);
			expect(persisted?.every((byte, index) => byte === update[index])).toBe(true);
			expect(readText(persisted)).toBe(readText(update));
			expect(await getPartKeys(storage)).toHaveLength(3);
		});
	});

	it("drops the previous parts when the state shrinks", async () => {
		const largeUpdate = createYjsUpdate(3 * 1024 * 1024);
		const smallUpdate = createYjsUpdate(1024);

		await runInSession("shrinking-document", async (storage) => {
			await storage.transaction((transaction) =>
				writePersistedDocumentYjsUpdate(transaction, largeUpdate),
			);
			expect(await getPartKeys(storage)).not.toHaveLength(0);
			await storage.transaction((transaction) =>
				writePersistedDocumentYjsUpdate(transaction, smallUpdate),
			);

			expect(await readPersistedDocumentYjsUpdate(storage)).toEqual(smallUpdate);
			expect(await getPartKeys(storage)).toHaveLength(0);
		});
	});
});

async function runInSession(
	name: string,
	callback: (storage: DurableObjectStorage) => Promise<void>,
) {
	const stub = env.DocumentSession.get(env.DocumentSession.idFromName(name));
	await runInDurableObject(stub, (_instance, state) => callback(state.storage));
}

function createYjsUpdate(textBytes: number) {
	const document = new Y.Doc();
	document.getText("content").insert(0, "x".repeat(textBytes));
	const update = Y.encodeStateAsUpdate(document);
	document.destroy();
	return update;
}

function readText(update: Uint8Array | undefined) {
	const document = new Y.Doc();
	Y.applyUpdate(document, update ?? new Uint8Array());
	const text = document.getText("content").toJSON();
	document.destroy();
	return text;
}

async function getPartKeys(storage: DurableObjectStorage) {
	return [...(await storage.list({ prefix: partKeyPrefix })).keys()];
}
