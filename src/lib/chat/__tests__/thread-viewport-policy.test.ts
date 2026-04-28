import { describe, expect, it } from "vitest";

import { resolveThreadViewportAction } from "@/components/chat/use-thread-viewport-controller";

describe("resolveThreadViewportAction", () => {
  it("snaps to bottom when opening a thread with an assistant tail", () => {
    expect(
      resolveThreadViewportAction({
        phase: "thread-open",
        previousStatus: null,
        status: "ready",
        tailRole: "assistant",
      }),
    ).toBe("snap-to-bottom");
  });

  it("pins the last user when opening a running user-tail thread", () => {
    expect(
      resolveThreadViewportAction({
        phase: "thread-open",
        previousStatus: null,
        status: "submitted",
        tailRole: "user",
      }),
    ).toBe("pin-last-user");
  });

  it("pins the last user when a new turn starts in the current thread", () => {
    expect(
      resolveThreadViewportAction({
        phase: "status-change",
        previousStatus: "ready",
        status: "streaming",
        tailRole: "user",
      }),
    ).toBe("pin-last-user");
  });

  it("does nothing for steady-state streaming updates", () => {
    expect(
      resolveThreadViewportAction({
        phase: "status-change",
        previousStatus: "streaming",
        status: "streaming",
        tailRole: "assistant",
      }),
    ).toBeNull();
  });
});
