import { describe, expect, it } from "vitest";
import type { EventResponse, WorkspaceEvent } from "@/lib/workspace/events";
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

  it("returns empty initial state before the projection snapshot arrives", () => {
    const derived = deriveWorkspaceStateFromCaches({
      workspaceId: "ws-1",
      stateData: null,
      eventLog: { version: 5, events: [event(5, "ignored until state loads")] },
    });

    expect(derived.state).toEqual([]);
    expect(derived.version).toBe(5);
  });
});
