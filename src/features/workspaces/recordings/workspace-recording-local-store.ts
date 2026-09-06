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
		const request = database.transaction("recordings").objectStore("recordings").getAll();
		const recordings = await new Promise<LocalWorkspaceRecording[]>((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		return recordings.filter((recording) => recording.workspaceId === workspaceId);
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
		const request = indexedDB.open("thinkex-completed-recordings", 1);
		request.onupgradeneeded = () =>
			request.result.createObjectStore("recordings", { keyPath: "itemId" });
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
