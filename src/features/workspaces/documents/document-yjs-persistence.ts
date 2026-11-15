const persistedDocumentYjsUpdateKey = "document-session:yjs-update";
const persistedDocumentYjsPartKeyPrefix = "document-session:yjs-update-part:";
// Durable Object storage rejects any single value over 2 MB, and widget blocks
// can carry enough HTML to push a document's Yjs state past it. Larger states
// are split into parts behind a manifest stored at the update key.
const maximumPersistedDocumentYjsPartBytes = 1024 * 1024;

interface PersistedDocumentYjsManifest {
	generation: string;
	totalBytes: number;
}

type PersistedDocumentYjsValue = Uint8Array | PersistedDocumentYjsManifest;

export async function readPersistedDocumentYjsUpdate(storage: DurableObjectStorage) {
	const stored = await storage.get<PersistedDocumentYjsValue>(persistedDocumentYjsUpdateKey);
	if (!stored || stored instanceof Uint8Array) {
		return stored;
	}

	const keys = getPersistedDocumentYjsPartKeys(stored);
	const parts = await storage.get<Uint8Array>(keys);
	const update = new Uint8Array(stored.totalBytes);
	let offset = 0;

	for (const key of keys) {
		const part = parts.get(key);
		if (!part) {
			throw new Error("Persisted document state is incomplete.");
		}
		update.set(part, offset);
		offset += part.byteLength;
	}

	if (offset !== update.byteLength) {
		throw new Error("Persisted document state size does not match its manifest.");
	}

	return update;
}

export async function writePersistedDocumentYjsUpdate(
	transaction: DurableObjectTransaction,
	update: Uint8Array,
) {
	const previous = await transaction.get<PersistedDocumentYjsValue>(persistedDocumentYjsUpdateKey);

	if (update.byteLength <= maximumPersistedDocumentYjsPartBytes) {
		await transaction.put(persistedDocumentYjsUpdateKey, update);
	} else {
		const manifest: PersistedDocumentYjsManifest = {
			generation: crypto.randomUUID(),
			totalBytes: update.byteLength,
		};

		await Promise.all(
			getPersistedDocumentYjsPartKeys(manifest).map((key, index) => {
				const start = index * maximumPersistedDocumentYjsPartBytes;
				return transaction.put(
					key,
					update.slice(start, start + maximumPersistedDocumentYjsPartBytes),
				);
			}),
		);
		await transaction.put(persistedDocumentYjsUpdateKey, manifest);
	}

	if (previous && !(previous instanceof Uint8Array)) {
		await transaction.delete(getPersistedDocumentYjsPartKeys(previous));
	}
}

function getPersistedDocumentYjsPartKeys(manifest: PersistedDocumentYjsManifest) {
	return Array.from(
		{ length: Math.ceil(manifest.totalBytes / maximumPersistedDocumentYjsPartBytes) },
		(_, index) => `${persistedDocumentYjsPartKeyPrefix}${manifest.generation}:${index}`,
	);
}
