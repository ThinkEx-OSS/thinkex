import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchThreadMessages } from "../queries";

describe("fetchThreadMessages", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty message list for missing persisted threads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404 }),
    );

    await expect(fetchThreadMessages("missing-thread")).resolves.toEqual([]);
  });

  it("returns an empty message list for an existing thread with no messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ messages: [] }),
      }),
    );

    await expect(fetchThreadMessages("empty-thread")).resolves.toEqual([]);
  });
});
