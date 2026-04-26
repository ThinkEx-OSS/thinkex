import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchThreadMessages } from "../queries";

describe("fetchThreadMessages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("distinguishes missing persisted threads from valid empty threads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    await expect(fetchThreadMessages("missing-thread")).resolves.toEqual({
      kind: "missing",
      messages: [],
    });
  });

  it("returns found for an existing thread with no messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [] }),
      }),
    );

    await expect(fetchThreadMessages("empty-thread")).resolves.toEqual({
      kind: "found",
      messages: [],
    });
  });
});
