import { describe, expect, it, vi } from "vitest";
import type {
  MessageFormatAdapter,
  MessageFormatItem,
  MessageStorageEntry,
} from "@assistant-ui/react";
import {
  createCustomThreadHistoryAdapter,
  sortParentsBeforeChildren,
} from "@/lib/chat/custom-thread-history-adapter";

type TestMessage = {
  id: string;
  value: string;
};

type TestStorage = {
  value: string;
};

const formatAdapter: MessageFormatAdapter<TestMessage, TestStorage> = {
  format: "test-format",
  encode(item) {
    return { value: item.message.value };
  },
  decode(stored: MessageStorageEntry<TestStorage>) {
    return {
      parentId: stored.parent_id,
      message: {
        id: stored.id,
        value: stored.content.value,
      },
    };
  },
  getId(message) {
    return message.id;
  },
};

const asFetch = (mock: ReturnType<typeof vi.fn>) => mock as unknown as typeof fetch;

const createAui = (remoteId: string | null = "thread-1") => ({
  threadListItem() {
    return {
      initialize: vi.fn().mockResolvedValue({ remoteId: remoteId ?? "thread-1" }),
      getState: vi.fn().mockReturnValue({ remoteId }),
    };
  },
});

describe("sortParentsBeforeChildren", () => {
  it("keeps parents before children when API rows arrive newest-first", () => {
    const sorted = sortParentsBeforeChildren(
      [
        {
          parentId: "parent",
          message: { id: "child" },
          created_at: "2025-01-02T00:00:00.000Z",
        },
        {
          parentId: null,
          message: { id: "parent" },
          created_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      (item) => item.created_at
    );

    expect(sorted.map((item) => item.message.id)).toEqual(["parent", "child"]);
  });

  it("keeps orphaned subtrees ordered parent-before-child", () => {
    const sorted = sortParentsBeforeChildren(
      [
        {
          parentId: "missing-root",
          message: { id: "orphan-parent" },
          created_at: "2025-01-02T00:00:00.000Z",
        },
        {
          parentId: "orphan-parent",
          message: { id: "orphan-child" },
          created_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      (item) => item.created_at
    );

    expect(sorted.map((item) => item.message.id)).toEqual([
      "orphan-parent",
      "orphan-child",
    ]);
  });

  it("breaks cycles one item at a time in stable timestamp order", () => {
    const sorted = sortParentsBeforeChildren(
      [
        {
          parentId: "b",
          message: { id: "a" },
          created_at: "2025-01-02T00:00:00.000Z",
        },
        {
          parentId: "a",
          message: { id: "b" },
          created_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      (item) => item.created_at
    );

    expect(sorted.map((item) => item.message.id)).toEqual(["b", "a"]);
  });
});

describe("createCustomThreadHistoryAdapter", () => {
  it("posts encoded messages when appending through withFormat", async () => {
    const aui = createAui("thread-123");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
    const adapter = createCustomThreadHistoryAdapter(aui, asFetch(fetchMock));

    await adapter.withFormat?.(formatAdapter).append({
      parentId: "parent-1",
      message: { id: "msg-1", value: "hello" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/threads/thread-123/messages",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          messageId: "msg-1",
          parentId: "parent-1",
          format: "test-format",
          content: { value: "hello" },
        }),
      })
    );
  });

  it("skips updates when no remote thread id is available", async () => {
    const aui = createAui(null);
    const fetchMock = vi.fn();
    const adapter = createCustomThreadHistoryAdapter(aui, asFetch(fetchMock));

    await adapter.withFormat?.(formatAdapter).update?.(
      {
        parentId: null,
        message: { id: "msg-1", value: "hello" },
      },
      "msg-1"
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("patches encoded content for existing messages", async () => {
    const aui = createAui("thread-123");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ ok: true }),
    });
    const adapter = createCustomThreadHistoryAdapter(aui, asFetch(fetchMock));

    await adapter.withFormat?.(formatAdapter).update?.(
      {
        parentId: null,
        message: { id: "msg-1", value: "updated" },
      },
      "msg-1"
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/threads/thread-123/messages/msg-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          content: { value: "updated" },
        }),
      })
    );
  });

  it("loads, filters, sorts, and preserves the API head id", async () => {
    const aui = createAui("thread-123");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        headId: "branch-tip",
        messages: [
          {
            id: "child",
            parent_id: "parent",
            format: "test-format",
            content: { value: "child" },
            created_at: "2025-01-02T00:00:00.000Z",
          },
          {
            id: "ignored",
            parent_id: null,
            format: "other-format",
            content: { value: "ignored" },
            created_at: "2025-01-03T00:00:00.000Z",
          },
          {
            id: "parent",
            parent_id: null,
            format: "test-format",
            content: { value: "parent" },
            created_at: "2025-01-01T00:00:00.000Z",
          },
        ],
      }),
    });
    const adapter = createCustomThreadHistoryAdapter(aui, asFetch(fetchMock));

    const repo = await adapter.withFormat?.(formatAdapter).load();

    expect(repo).toEqual({
      headId: "branch-tip",
      messages: [
        {
          parentId: null,
          message: { id: "parent", value: "parent" },
        },
        {
          parentId: "parent",
          message: { id: "child", value: "child" },
        },
      ],
    });
  });

  it("falls back to the last sorted message id when the API omits headId", async () => {
    const aui = createAui("thread-123");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        messages: [
          {
            id: "orphan-parent",
            parent_id: "missing-root",
            format: "test-format",
            content: { value: "parent" },
            created_at: "2025-01-02T00:00:00.000Z",
          },
          {
            id: "orphan-child",
            parent_id: "orphan-parent",
            format: "test-format",
            content: { value: "child" },
            created_at: "2025-01-01T00:00:00.000Z",
          },
        ],
      }),
    });
    const adapter = createCustomThreadHistoryAdapter(aui, asFetch(fetchMock));

    const repo = await adapter.withFormat?.(formatAdapter).load();

    expect(repo?.messages.map((item) => item.message.id)).toEqual([
      "orphan-parent",
      "orphan-child",
    ]);
    expect(repo?.headId).toBe("orphan-child");
  });

  it("returns an empty repository when the thread has not been initialized", async () => {
    const aui = createAui(null);
    const fetchMock = vi.fn();
    const adapter = createCustomThreadHistoryAdapter(aui, asFetch(fetchMock));

    const repo = await adapter.withFormat?.(formatAdapter).load();

    expect(repo).toEqual({ messages: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
