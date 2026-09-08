/** Completed audio retained locally until upload succeeds. Active capture is memory-only. */
export interface LocalWorkspaceRecording {
	readonly itemId: string;
	readonly uploadId: string;
	readonly workspaceId: string;
	readonly mimeType: string;
	readonly durationMs: number;
	readonly blob: Blob;
}

/** Store the completed recording in one transaction after Done. */
export async function saveLocalWorkspaceRecording(recording: LocalWorkspaceRecording) {
	const database = await openDatabase();
	try {
		const transaction = database.transaction("recordings", "readwrite");
		transaction.objectStore("recordings").put(recording);
		await transactionDone(transaction);
	} finally {
		database.close();
	}
}

/** Find completed uploads awaiting retry in this workspace. */
export async function listLocalWorkspaceRecordings(workspaceId: string) {
	const database = await openDatabase();
	try {
		const request = database
			.transaction("recordings")
			.objectStore("recordings")
			.index("workspaceId")
			.getAll(workspaceId);
		const recordings = await new Promise<LocalWorkspaceRecording[]>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return recordings;
	} finally {
		database.close();
	}
}

/** Remove completed audio only after the server acknowledges it. */
export async function deleteLocalWorkspaceRecording(itemId: string) {
	const database = await openDatabase();
	try {
		const transaction = database.transaction("recordings", "readwrite");
		transaction.objectStore("recordings").delete(itemId);
		await transactionDone(transaction);
	} finally {
		database.close();
	}
}

function openDatabase() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open("thinkex-completed-recordings", 2);
		request.onupgradeneeded = () => {
			const store = request.result.objectStoreNames.contains("recordings")
				? request.transaction?.objectStore("recordings")
				: request.result.createObjectStore("recordings", { keyPath: "itemId" });
			store?.createIndex("workspaceId", "workspaceId");
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function transactionDone(transaction: IDBTransaction) {
	return new Promise<void>((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onabort = transaction.onerror = () =>
			reject(transaction.error ?? new Error("Couldn’t save audio on this device."));
	});
}
