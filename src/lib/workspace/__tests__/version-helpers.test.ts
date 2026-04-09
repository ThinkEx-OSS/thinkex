import { describe, expect, it } from "vitest";
import {
  computeBaseVersion,
  removeOptimisticEvent,
  confirmOptimisticEvent,
} from "../version-helpers";
import type { EventResponse } from "../events";

function makeCache(
  version: number,
  events: Array<{ id: string; version?: number }>,
): EventResponse {
  return {
    version,
    events: events.map((e) => ({
      id: e.id,
      type: "ITEM_DELETED" as const,
      timestamp: Date.now(),
      userId: "u",
      payload: { id: "x" },
      ...(e.version !== undefined && { version: e.version }),
    })),
  };
}

describe("computeBaseVersion", () => {
  it("returns 0 for undefined cache", () => {
    const result = computeBaseVersion(undefined);
    expect(result.baseVersion).toBe(0);
    expect(result.currentVersion).toBe(0);
    expect(result.optimisticCount).toBe(0);
  });

  it("returns cache version when no optimistic events", () => {
    const cache = makeCache(10, [{ id: "a", version: 10 }]);
    const result = computeBaseVersion(cache);
    expect(result.baseVersion).toBe(10);
    expect(result.currentVersion).toBe(10);
  });

  it("adjusts for optimistic events (subtracts own)", () => {
    const cache = makeCache(10, [
      { id: "a", version: 10 },
      { id: "b" },
      { id: "c" },
    ]);
    const result = computeBaseVersion(cache);
    expect(result.optimisticCount).toBe(2);
    expect(result.baseVersion).toBe(11);
  });

  it("uses max event version over cache version", () => {
    const cache = makeCache(5, [
      { id: "a", version: 5 },
      { id: "b", version: 8 },
    ]);
    const result = computeBaseVersion(cache);
    expect(result.currentVersion).toBe(8);
    expect(result.baseVersion).toBe(8);
  });
});

describe("removeOptimisticEvent", () => {
  it("removes event by ID", () => {
    const cache = makeCache(5, [
      { id: "a", version: 5 },
      { id: "b" },
    ]);
    const result = removeOptimisticEvent(cache, "b");
    expect(result?.events).toHaveLength(1);
    expect(result?.events[0].id).toBe("a");
  });

  it("updates version when provided", () => {
    const cache = makeCache(5, [{ id: "a", version: 5 }]);
    const result = removeOptimisticEvent(cache, "x", 10);
    expect(result?.version).toBe(10);
  });

  it("returns undefined for undefined input", () => {
    expect(removeOptimisticEvent(undefined, "a")).toBeUndefined();
  });
});

describe("confirmOptimisticEvent", () => {
  it("stamps version on the matching event", () => {
    const cache = makeCache(5, [
      { id: "a", version: 5 },
      { id: "b" },
    ]);
    const result = confirmOptimisticEvent(cache, "b", 6);
    expect(result?.events[1].version).toBe(6);
    expect(result?.version).toBe(6);
  });

  it("returns undefined for undefined input", () => {
    expect(confirmOptimisticEvent(undefined, "a", 1)).toBeUndefined();
  });
});
