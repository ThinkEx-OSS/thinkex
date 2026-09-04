const recordingDatabaseName = "thinkex-recordings";
const recordingDatabaseVersion = 1;

export interface LocalWorkspaceRecording {
	readonly itemId: string;
	readonly workspaceId: string;
	readonly mimeType: string;
	readonly segmentCount: number;
	readonly durationMs: number;
}

export interface LocalWorkspaceRecordingSegment {
	readonly key: string;
	readonly itemId: string;
	readonly workspaceId: string;
	readonly sequence: number;
	readonly durationMs: number;
	readonly mimeType: string;
	readonly blob: Blob;
}

/** Save a newly created recording session before microphone capture begins. */
export async function saveLocalWorkspaceRecording(recording: LocalWorkspaceRecording) {
	const database = await openRecordingDatabase();
	await runRequest(
		database.transaction("recordings", "readwrite").objectStore("recordings").put(recording),
	);
	database.close();
}

/** Atomically preserve a completed audio segment and advance its session. */
export async function saveLocalWorkspaceRecordingSegment(
	recording: LocalWorkspaceRecording,
	segment: Omit<LocalWorkspaceRecordingSegment, "key">,
) {
	const database = await openRecordingDatabase();
	const transaction = database.transaction(["recordings", "segments"], "readwrite");
	transaction.objectStore("recordings").put(recording);
	transaction
		.objectStore("segments")
		.put({ ...segment, key: segmentKey(segment.itemId, segment.sequence) });
	await transactionDone(transaction);
	database.close();
}

/** Return unfinished local sessions for one workspace after a reload. */
export async function listLocalWorkspaceRecordings(workspaceId: string) {
	const database = await openRecordingDatabase();
	const recordings = await runRequest<LocalWorkspaceRecording[]>(
		database.transaction("recordings").objectStore("recordings").getAll(),
	);
	database.close();
	return recordings.filter((recording) => recording.workspaceId === workspaceId);
}

/** Return locally retained segments in playback order. */
export async function listLocalWorkspaceRecordingSegments(itemId: string) {
	const database = await openRecordingDatabase();
	const segments = await runRequest<LocalWorkspaceRecordingSegment[]>(
		database.transaction("segments").objectStore("segments").getAll(),
	);
	database.close();
	return segments
		.filter((segment) => segment.itemId === itemId)
		.sort((left, right) => left.sequence - right.sequence);
}

/** Drop a local blob only after the server acknowledges that exact sequence. */
export async function deleteLocalWorkspaceRecordingSegment(itemId: string, sequence: number) {
	const database = await openRecordingDatabase();
	await runRequest(
		database
			.transaction("segments", "readwrite")
			.objectStore("segments")
			.delete(segmentKey(itemId, sequence)),
	);
	database.close();
}

/** Clear the recovery marker after the server accepts finalization. */
export async function deleteLocalWorkspaceRecording(itemId: string) {
	const segments = await listLocalWorkspaceRecordingSegments(itemId);
	const database = await openRecordingDatabase();
	const transaction = database.transaction(["recordings", "segments"], "readwrite");
	transaction.objectStore("recordings").delete(itemId);
	for (const segment of segments) {
		transaction.objectStore("segments").delete(segment.key);
	}
	await transactionDone(transaction);
	database.close();
}

function segmentKey(itemId: string, sequence: number) {
	return `${itemId}:${String(sequence).padStart(4, "0")}`;
}

function openRecordingDatabase() {
	return new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(recordingDatabaseName, recordingDatabaseVersion);
		request.onupgradeneeded = () => {
			const database = request.result;
			if (!database.objectStoreNames.contains("recordings")) {
				database.createObjectStore("recordings", { keyPath: "itemId" });
			}
			if (!database.objectStoreNames.contains("segments")) {
				database.createObjectStore("segments", { keyPath: "key" });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error("Unable to open recording storage."));
	});
}

function runRequest<T = undefined>(request: IDBRequest<T>) {
	return new Promise<T>((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error("Recording storage failed."));
	});
}

function transactionDone(transaction: IDBTransaction) {
	return new Promise<void>((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => reject(transaction.error ?? new Error("Recording storage failed."));
		transaction.onabort = () =>
			reject(transaction.error ?? new Error("Recording storage was aborted."));
	});
}
