import { describe, expect, it } from "vitest";
import type { EventResponse, WorkspaceEvent } from "@/lib/workspace/events";
import { toClientWorkspaceEvent } from "@/lib/workspace/workspace-event-client-payload";
import type { Item } from "@/lib/workspace-state/types";
import { deriveWorkspaceStateFromCaches } from "./workspace-state-cache";

const baseState = {
  state: [
    {
      id: "doc-1",
      type: "document",
      name: "Doc",
      subtitle: "",
      data: { markdown: "base" },
    },
  ],
  version: 2,
} satisfies { state: Item[]; version: number };

function event(version: number | undefined, changes: string): WorkspaceEvent {
  return {
    id: `evt-${version ?? "optimistic"}-${changes}`,
    type: "ITEM_UPDATED",
    payload: {
      id: "doc-1",
      changes: { data: { markdown: changes } },
    },
    timestamp: Date.now(),
    userId: "user-1",
    ...(typeof version === "number" ? { version } : {}),
  } as WorkspaceEvent;
}

describe("workspace-state-cache", () => {
  it("applies only delta and optimistic events on top of projection state", () => {
    const eventLog: EventResponse = {
      version: 4,
      events: [
        event(1, "ignored"),
        event(3, "confirmed"),
        event(undefined, "optimistic"),
      ],
    };

    const derived = deriveWorkspaceStateFromCaches({
      workspaceId: "ws-1",
      stateData: baseState,
      eventLog,
    });

    expect(derived.version).toBe(4);
    expect(derived.state).toEqual([
      {
        id: "doc-1",
        type: "document",
        name: "Doc",
        subtitle: "",
        data: { markdown: "optimistic" },
        lastModified: eventLog.events[2].timestamp,
      },
    ]);
  });

  it("returns empty initial state before the projection payload arrives", () => {
    const derived = deriveWorkspaceStateFromCaches({
      workspaceId: "ws-1",
      stateData: null,
      eventLog: { version: 5, events: [event(5, "ignored until state loads")] },
    });

    expect(derived.state).toEqual([]);
    expect(derived.version).toBe(5);
  });

  it("does not leak another user's confirmed per-user state via delta overlay", () => {
    const stateData = {
      state: [
        {
          id: "yt-1",
          type: "youtube",
          name: "Video",
          subtitle: "",
          data: {
            url: "https://youtu.be/1",
            progress: 12,
            playbackRate: 1,
          },
        },
      ] satisfies Item[],
      version: 2,
    };

    const leakedConfirmedEvent: WorkspaceEvent = {
      id: "evt-confirmed",
      type: "ITEM_UPDATED",
      payload: {
        id: "yt-1",
        changes: {
          data: {
            progress: 77,
            playbackRate: 1.75,
          },
        },
      },
      timestamp: Date.now(),
      userId: "other-user",
      version: 3,
    } as WorkspaceEvent;

    const eventLog: EventResponse = {
      version: 3,
      events: [toClientWorkspaceEvent(leakedConfirmedEvent)],
    };

    const derived = deriveWorkspaceStateFromCaches({
      workspaceId: "ws-1",
      stateData,
      eventLog,
    });

    expect(derived.state).toEqual([
      {
        ...stateData.state[0],
        lastModified: leakedConfirmedEvent.timestamp,
      },
    ]);
    expect(derived.version).toBe(3);
  });
});
