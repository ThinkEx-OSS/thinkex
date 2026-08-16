import { afterEach, describe, expect, it, vi } from "vitest";

import { useWorkspaceAiQueueStore } from "#/features/workspaces/state/workspace-ai-queue-store";

function getQueue(threadId: string) {
	return useWorkspaceAiQueueStore.getState().queuesByThreadId[threadId] ?? [];
}

describe("workspace AI message queue", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("enqueues in FIFO order and supports atHead", () => {
		const threadId = crypto.randomUUID();
		const store = useWorkspaceAiQueueStore.getState();

		const first = store.enqueue(threadId, { text: "first" });
		const second = store.enqueue(threadId, { text: "second" });
		const steered = store.enqueue(threadId, { text: "steered", atHead: true });

		expect(getQueue(threadId).map((entry) => entry.id)).toEqual([steered, first, second]);
		expect(getQueue(threadId).map((entry) => entry.promoted)).toEqual([true, false, false]);
	});

	it("rejects empty messages but accepts file-only ones", () => {
		const threadId = crypto.randomUUID();
		const store = useWorkspaceAiQueueStore.getState();

		expect(store.enqueue(threadId, { text: "   " })).toBeNull();
		expect(
			store.enqueue(threadId, {
				text: "",
				files: [{ mediaType: "image/png", type: "file", url: "https://r2/x.png" }],
			}),
		).not.toBeNull();
	});

	it("takeHead only succeeds for the current head, exactly once", () => {
		const threadId = crypto.randomUUID();
		const store = useWorkspaceAiQueueStore.getState();

		const first = store.enqueue(threadId, { text: "first" })!;
		const second = store.enqueue(threadId, { text: "second" })!;

		expect(store.takeHead(threadId, second)).toBeNull();
		expect(store.takeHead(threadId, "missing")).toBeNull();
		expect(store.takeHead(threadId, first)?.text).toBe("first");
		expect(store.takeHead(threadId, first)).toBeNull();
		expect(store.takeHead(threadId, second)?.text).toBe("second");
		expect(getQueue(threadId)).toEqual([]);
	});

	it("restoreAtHead puts a taken entry back first", () => {
		const threadId = crypto.randomUUID();
		const store = useWorkspaceAiQueueStore.getState();

		const first = store.enqueue(threadId, { text: "first" })!;
		store.enqueue(threadId, { text: "second" });

		const taken = store.takeHead(threadId, first)!;
		store.restoreAtHead(threadId, taken);

		expect(getQueue(threadId)[0]?.id).toBe(first);
	});

	it("remove returns the entry once, then null (edit race guard)", () => {
		const threadId = crypto.randomUUID();
		const store = useWorkspaceAiQueueStore.getState();

		const id = store.enqueue(threadId, { text: "edit me" })!;

		expect(store.remove(threadId, id)?.text).toBe("edit me");
		expect(store.remove(threadId, id)).toBeNull();
	});

	it("moveToHead and moveByIndex reorder with clamping", () => {
		const threadId = crypto.randomUUID();
		const store = useWorkspaceAiQueueStore.getState();

		const a = store.enqueue(threadId, { text: "a" })!;
		const b = store.enqueue(threadId, { text: "b" })!;
		const c = store.enqueue(threadId, { text: "c" })!;

		store.moveToHead(threadId, c);
		expect(getQueue(threadId).map((entry) => entry.id)).toEqual([c, a, b]);
		expect(getQueue(threadId)[0]?.promoted).toBe(true);

		store.moveByIndex(threadId, 0, 99);
		expect(getQueue(threadId).map((entry) => entry.id)).toEqual([a, b, c]);

		store.moveByIndex(threadId, 5, 0);
		expect(getQueue(threadId).map((entry) => entry.id)).toEqual([a, b, c]);
	});

	it("marks an existing queue head as promoted when sent now", () => {
		const threadId = crypto.randomUUID();
		const store = useWorkspaceAiQueueStore.getState();
		const first = store.enqueue(threadId, { text: "first" })!;

		store.moveToHead(threadId, first);

		expect(getQueue(threadId)[0]).toMatchObject({ id: first, promoted: true });
	});

	it("pause and resume toggle the per-thread flag", () => {
		const threadId = crypto.randomUUID();
		const store = useWorkspaceAiQueueStore.getState();

		store.pause(threadId);
		expect(useWorkspaceAiQueueStore.getState().pausedByThreadId[threadId]).toBe(true);
		store.resume(threadId);
		expect(useWorkspaceAiQueueStore.getState().pausedByThreadId[threadId]).toBeUndefined();
	});

	it("clears a deleted thread and discards its queued attachments", () => {
		const threadId = crypto.randomUUID();
		const survivingThreadId = crypto.randomUUID();
		const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
		vi.stubGlobal("fetch", fetchMock);
		const store = useWorkspaceAiQueueStore.getState();

		store.enqueue(threadId, {
			files: [
				{ mediaType: "image/png", type: "file", url: "https://r2.example/one.png" },
				{ mediaType: "image/png", type: "file", url: "https://r2.example/two.png" },
			],
			text: "deleted",
		});
		store.pause(threadId);
		store.enqueue(survivingThreadId, { text: "keep me" });
		store.pause(survivingThreadId);

		store.clearThread(threadId);

		expect(getQueue(threadId)).toEqual([]);
		expect(useWorkspaceAiQueueStore.getState().pausedByThreadId[threadId]).toBeUndefined();
		expect(getQueue(survivingThreadId).map((entry) => entry.text)).toEqual(["keep me"]);
		expect(useWorkspaceAiQueueStore.getState().pausedByThreadId[survivingThreadId]).toBe(true);
		expect(fetchMock.mock.calls).toEqual([
			["https://r2.example/one.png", { method: "DELETE" }],
			["https://r2.example/two.png", { method: "DELETE" }],
		]);
	});
});
