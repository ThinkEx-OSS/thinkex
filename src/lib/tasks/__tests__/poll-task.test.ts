import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { pollTask } from "../poll-task";

describe("pollTask", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns completed immediately when first poll is terminal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "completed" }),
      }),
    );

    const result = await pollTask({
      statusUrl: "/api/test/status",
      intervalMs: 100,
    });

    expect(result.status).toBe("completed");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("returns failed when status endpoint returns error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "internal" }),
      }),
    );

    const result = await pollTask({
      statusUrl: "/api/test/status",
      intervalMs: 100,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toContain("500");
  });

  it("times out after maxAttempts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "running" }),
      }),
    );

    const promise = pollTask({
      statusUrl: "/api/test/status",
      intervalMs: 10,
      maxAttempts: 3,
    });

    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(50);
    }

    const result = await promise;
    expect(result.status).toBe("failed");
    expect(result.error).toContain("timed out");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("returns cancelled when signal is aborted", async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(
        Object.assign(new DOMException("Aborted", "AbortError")),
      ),
    );

    controller.abort();

    const result = await pollTask({
      statusUrl: "/api/test/status",
      signal: controller.signal,
    });

    expect(result.status).toBe("cancelled");
  });

  it("propagates error string from terminal status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "failed", error: "OCR engine down" }),
      }),
    );

    const result = await pollTask({
      statusUrl: "/api/test/status",
      intervalMs: 100,
    });

    expect(result.status).toBe("failed");
    expect(result.error).toBe("OCR engine down");
  });

  it("calls onStatus callback on each poll", async () => {
    let callCount = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () =>
            callCount >= 2
              ? { status: "completed" }
              : { status: "running" },
        };
      }),
    );

    const statuses: string[] = [];

    const promise = pollTask({
      statusUrl: "/api/test/status",
      intervalMs: 10,
      onStatus: (s) => statuses.push(s),
    });

    await vi.advanceTimersByTimeAsync(50);
    await promise;

    expect(statuses).toContain("running");
    expect(statuses).toContain("completed");
  });
});
