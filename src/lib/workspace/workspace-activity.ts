import type { WorkspaceEvent } from "@/lib/workspace/events";
import { initialState } from "@/lib/workspace-state/state";
import { eventReducer } from "@/lib/workspace/event-reducer";
import type { WorkspaceState } from "@/lib/workspace-state/types";

export interface WorkspaceActivitySummary {
  version: number;
  eventCount: number;
  lastEventAt: number | null;
}

export const EMPTY_WORKSPACE_ACTIVITY_SUMMARY: WorkspaceActivitySummary = {
  version: 0,
  eventCount: 0,
  lastEventAt: null,
};

export type WorkspaceStatePayload = {
  state: WorkspaceState;
  activity: WorkspaceActivitySummary;
};

export function createFallbackWorkspaceState(
  workspaceId: string | null | undefined,
): WorkspaceState {
  return {
    ...initialState,
    workspaceId: workspaceId || undefined,
  };
}

export function createFallbackWorkspaceStatePayload(
  workspaceId: string | null | undefined,
): WorkspaceStatePayload {
  return {
    state: createFallbackWorkspaceState(workspaceId),
    activity: EMPTY_WORKSPACE_ACTIVITY_SUMMARY,
  };
}

export function normalizeWorkspaceStatePayload(
  workspaceId: string,
  data: {
    workspace?: {
      state?: WorkspaceState;
      activity?: WorkspaceActivitySummary;
    };
  },
): WorkspaceStatePayload {
  return {
    state: data.workspace?.state ?? createFallbackWorkspaceState(workspaceId),
    activity:
      data.workspace?.activity ?? EMPTY_WORKSPACE_ACTIVITY_SUMMARY,
  };
}

function normalizeEventTimestamp(
  timestamp: number | null | undefined,
): number | null {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return timestamp;
  }

  return null;
}

export function applyEventToWorkspaceStatePayload(
  payload: WorkspaceStatePayload,
  event: WorkspaceEvent,
  options?: {
    incrementEventCount?: boolean;
    confirmedVersion?: number;
  },
): WorkspaceStatePayload {
  const nextTimestamp = normalizeEventTimestamp(event.timestamp);

  return {
    state: eventReducer(payload.state, event),
    activity: {
      version:
        typeof options?.confirmedVersion === "number"
          ? Math.max(payload.activity.version, options.confirmedVersion)
          : payload.activity.version,
      eventCount:
        payload.activity.eventCount +
        (options?.incrementEventCount === false ? 0 : 1),
      lastEventAt: nextTimestamp ?? payload.activity.lastEventAt,
    },
  };
}

export function confirmWorkspaceStatePayloadVersion(
  payload: WorkspaceStatePayload,
  version: number,
  event?: Pick<WorkspaceEvent, "timestamp">,
): WorkspaceStatePayload {
  const nextTimestamp = normalizeEventTimestamp(event?.timestamp);

  return {
    ...payload,
    activity: {
      ...payload.activity,
      version: Math.max(payload.activity.version, version),
      lastEventAt: nextTimestamp ?? payload.activity.lastEventAt,
    },
  };
}

export function getWorkspaceLastSavedAt(
  lastEventAt: number | null | undefined,
): Date {
  if (typeof lastEventAt === "number" && Number.isFinite(lastEventAt)) {
    const date = new Date(lastEventAt);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return new Date();
}

export function shouldShowAnonymousSignInPrompt(params: {
  isAnonymous: boolean;
  isLoadingWorkspace: boolean;
  currentWorkspaceId: string | null;
  dismissedWorkspaceId: string | null;
  eventCount: number;
  threshold?: number;
}): boolean {
  const {
    isAnonymous,
    isLoadingWorkspace,
    currentWorkspaceId,
    dismissedWorkspaceId,
    eventCount,
    threshold = 15,
  } = params;

  return (
    isAnonymous &&
    !isLoadingWorkspace &&
    !!currentWorkspaceId &&
    eventCount >= threshold &&
    dismissedWorkspaceId !== currentWorkspaceId
  );
}
