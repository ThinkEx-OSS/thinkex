import { describe, expect, it } from "vitest";
import {
  applyEventToWorkspaceStatePayload,
  confirmWorkspaceStatePayloadVersion,
  createFallbackWorkspaceStatePayload,
  getWorkspaceLastSavedAt,
  normalizeWorkspaceStatePayload,
  shouldShowAnonymousSignInPrompt,
} from "../workspace-activity";

describe("workspace activity helpers", () => {
  it("normalizes workspace state payload metadata", () => {
    const result = normalizeWorkspaceStatePayload("ws-1", {
      workspace: {
        state: {
          workspaceId: "ws-1",
          items: [],
        },
        activity: {
          version: 7,
          eventCount: 21,
          lastEventAt: 123456,
        },
      },
    });

    expect(result.activity).toEqual({
      version: 7,
      eventCount: 21,
      lastEventAt: 123456,
    });
    expect(result.state.workspaceId).toBe("ws-1");
  });

  it("shows the anonymous prompt from event count metadata only", () => {
    expect(
      shouldShowAnonymousSignInPrompt({
        isAnonymous: true,
        isLoadingWorkspace: false,
        currentWorkspaceId: "ws-1",
        dismissedWorkspaceId: null,
        eventCount: 15,
      }),
    ).toBe(true);

    expect(
      shouldShowAnonymousSignInPrompt({
        isAnonymous: true,
        isLoadingWorkspace: false,
        currentWorkspaceId: "ws-1",
        dismissedWorkspaceId: null,
        eventCount: 14,
      }),
    ).toBe(false);
  });

  it("derives last saved date from activity metadata", () => {
    expect(getWorkspaceLastSavedAt(123456).getTime()).toBe(123456);
  });

  it("applies optimistic events to the cached workspace payload", () => {
    const payload = createFallbackWorkspaceStatePayload("ws-1");
    const next = applyEventToWorkspaceStatePayload(payload, {
      id: "evt-1",
      type: "BULK_ITEMS_CREATED",
      payload: { items: [] },
      timestamp: 500,
      userId: "user-1",
    });

    expect(next.state.items).toEqual([]);
    expect(next.activity.version).toBe(0);
    expect(next.activity.eventCount).toBe(1);
    expect(next.activity.lastEventAt).toBe(500);
  });

  it("confirms cache payload version after the server accepts an event", () => {
    const payload = applyEventToWorkspaceStatePayload(
      createFallbackWorkspaceStatePayload("ws-1"),
      {
        id: "evt-1",
        type: "BULK_ITEMS_CREATED",
        payload: { items: [] },
        timestamp: 500,
        userId: "user-1",
      },
    );

    const confirmed = confirmWorkspaceStatePayloadVersion(payload, 9, {
      timestamp: 500,
    });

    expect(confirmed.activity.version).toBe(9);
    expect(confirmed.activity.eventCount).toBe(1);
    expect(confirmed.activity.lastEventAt).toBe(500);
  });
});
