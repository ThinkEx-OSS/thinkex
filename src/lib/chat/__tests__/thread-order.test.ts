import { describe, expect, it } from "vitest";

import { orderThreadsByRuntimeActivity } from "@/lib/chat/thread-order";
import type { ThreadStatus } from "@/lib/chat/thread-runtime-state";

const threads = [
  { id: "thread-a", status: "regular" as const, title: "A" },
  { id: "thread-b", status: "regular" as const, title: "B" },
  { id: "thread-c", status: "regular" as const, title: "C" },
];

describe("orderThreadsByRuntimeActivity", () => {
  it("preserves server ordering when nothing is running", () => {
    const ordered = orderThreadsByRuntimeActivity(threads, {
      getThreadStatus: () => "ready",
      getThreadLastStartedAt: () => 0,
    });

    expect(ordered.map((thread) => thread.id)).toEqual([
      "thread-a",
      "thread-b",
      "thread-c",
    ]);
  });

  it("moves running threads to the top", () => {
    const statuses: Record<string, ThreadStatus> = {
      "thread-a": "ready",
      "thread-b": "streaming",
      "thread-c": "ready",
    };

    const ordered = orderThreadsByRuntimeActivity(threads, {
      getThreadStatus: (threadId) => statuses[threadId] ?? "idle",
      getThreadLastStartedAt: () => 0,
    });

    expect(ordered.map((thread) => thread.id)).toEqual([
      "thread-b",
      "thread-a",
      "thread-c",
    ]);
  });

  it("orders running threads by most recent start time", () => {
    const statuses: Record<string, ThreadStatus> = {
      "thread-a": "streaming",
      "thread-b": "submitted",
      "thread-c": "ready",
    };
    const startedAt: Record<string, number> = {
      "thread-a": 10,
      "thread-b": 20,
      "thread-c": 0,
    };

    const ordered = orderThreadsByRuntimeActivity(threads, {
      getThreadStatus: (threadId) => statuses[threadId] ?? "idle",
      getThreadLastStartedAt: (threadId) => startedAt[threadId] ?? 0,
    });

    expect(ordered.map((thread) => thread.id)).toEqual([
      "thread-b",
      "thread-a",
      "thread-c",
    ]);
  });
});
