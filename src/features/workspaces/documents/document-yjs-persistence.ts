const persistedDocumentYjsUpdateKey = "document-session:yjs-update";
const persistedDocumentYjsPartKeyPrefix = "document-session:yjs-update-part:";
// Durable Object storage rejects any single value over 2 MB, and widget blocks
// can carry enough HTML to push a document's Yjs state past it. Larger states
// are split into parts behind a manifest stored at the update key.
const maximumPersistedDocumentYjsPartBytes = 1024 * 1024;

interface PersistedDocumentYjsManifest {
	generation: string;
	partCount: number;
	totalBytes: number;
	version: 1;
}

type PersistedDocumentYjsValue = Uint8Array | PersistedDocumentYjsManifest;

export async function readPersistedDocumentYjsUpdate(storage: DurableObjectStorage) {
	const stored = await storage.get<PersistedDocumentYjsValue>(persistedDocumentYjsUpdateKey);
	if (!stored || stored instanceof Uint8Array) {
		return stored;
	}
	if (!isPersistedDocumentYjsManifest(stored)) {
		throw new Error("Persisted document state manifest is invalid.");
	}

	const keys = getPersistedDocumentYjsPartKeys(stored);
	const parts = await storage.get<Uint8Array>(keys);
	const update = new Uint8Array(stored.totalBytes);
	let offset = 0;

	for (const key of keys) {
		const part = parts.get(key);
		if (!(part instanceof Uint8Array) || offset + part.byteLength > update.byteLength) {
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
			partCount: Math.ceil(update.byteLength / maximumPersistedDocumentYjsPartBytes),
			totalBytes: update.byteLength,
			version: 1,
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

	if (previous && isPersistedDocumentYjsManifest(previous)) {
		await transaction.delete(getPersistedDocumentYjsPartKeys(previous));
	}
}

function getPersistedDocumentYjsPartKeys(manifest: PersistedDocumentYjsManifest) {
	return Array.from(
		{ length: manifest.partCount },
		(_, index) => `${persistedDocumentYjsPartKeyPrefix}${manifest.generation}:${index}`,
	);
}

function isPersistedDocumentYjsManifest(
	value: PersistedDocumentYjsValue,
): value is PersistedDocumentYjsManifest {
	return (
		!(value instanceof Uint8Array) &&
		value.version === 1 &&
		typeof value.generation === "string" &&
		value.generation.length > 0 &&
		Number.isInteger(value.totalBytes) &&
		value.totalBytes > maximumPersistedDocumentYjsPartBytes &&
		value.partCount === Math.ceil(value.totalBytes / maximumPersistedDocumentYjsPartBytes)
	);
}
