import type { QueryClient } from "@tanstack/react-query";
import { initialItems } from "@/lib/workspace-state/state";
import type { Item } from "@/lib/workspace-state/types";
import { eventReducer } from "@/lib/workspace/event-reducer";
import type { EventResponse, WorkspaceEvent } from "@/lib/workspace/events";

export interface WorkspaceStateResponse {
  state: Item[];
  version: number;
}

export function workspaceStateQueryKey(workspaceId: string | null) {
  return ["workspace", workspaceId, "state"] as const;
}

export function applyConfirmedWorkspaceEventToState(
  stateData: WorkspaceStateResponse | null | undefined,
  event: WorkspaceEvent,
): WorkspaceStateResponse | null {
  if (!stateData || typeof event.version !== "number") {
    return stateData ?? null;
  }

  if (event.version <= stateData.version) {
    return stateData;
  }

  return {
    state: eventReducer(stateData.state, event),
    version: event.version,
  };
}

export function deriveWorkspaceStateFromCaches(params: {
  workspaceId: string | null;
  stateData?: WorkspaceStateResponse | null;
  eventLog?: EventResponse | null;
}): WorkspaceStateResponse {
  if (!params.workspaceId) {
    return {
      state: [...initialItems],
      version: 0,
    };
  }

  const stateData = params.stateData ?? null;
  const eventLog = params.eventLog ?? null;

  if (!stateData) {
    return {
      state: [...initialItems],
      version: eventLog?.version ?? 0,
    };
  }

  const deltaEvents = (eventLog?.events ?? []).filter(
    (event) =>
      typeof event.version !== "number" || event.version > stateData.version,
  );

  const derivedState =
    deltaEvents.length > 0
      ? deltaEvents.reduce(eventReducer, stateData.state)
      : stateData.state;

  return {
    state: derivedState,
    version: Math.max(stateData.version, eventLog?.version ?? 0),
  };
}

export function getCachedWorkspaceState(
  queryClient: QueryClient,
  workspaceId: string | null,
): WorkspaceStateResponse | null {
  if (!workspaceId) {
    return null;
  }

  return (
    queryClient.getQueryData<WorkspaceStateResponse>(
      workspaceStateQueryKey(workspaceId),
    ) ?? null
  );
}

export function applyConfirmedWorkspaceEventToStateQuery(
  queryClient: QueryClient,
  workspaceId: string | null,
  event: WorkspaceEvent,
): void {
  if (!workspaceId) {
    return;
  }

  queryClient.setQueryData<WorkspaceStateResponse | null>(
    workspaceStateQueryKey(workspaceId),
    (old) => applyConfirmedWorkspaceEventToState(old, event),
  );
}
