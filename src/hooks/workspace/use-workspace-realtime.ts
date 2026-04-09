/**
 * Real-time workspace subscription hook.
 *
 * Workspace events are saved first, then broadcast from the server as the
 * canonical event/version pair. Clients subscribe and merge those confirmed
 * events into the React Query cache.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase-client";
import { logger } from "@/lib/utils/logger";
import type { EventResponse, WorkspaceEvent } from "@/lib/workspace/events";
import { workspaceEventsQueryKey } from "./use-workspace-events";
import { applyConfirmedWorkspaceEventToStateQuery } from "./workspace-state-cache";

interface WorkspaceRealtimeOptions {
  onStatusChange?: (
    status: "connecting" | "connected" | "disconnected" | "error",
  ) => void;
  onRemoteEvent?: (event: WorkspaceEvent) => void;
}

interface WorkspaceRealtimeReturn {
  isConnected: boolean;
  reconnect: () => void;
}

function sortConfirmedEvents(events: WorkspaceEvent[]) {
  return [...events].sort((a, b) => {
    const versionA =
      typeof a.version === "number" ? a.version : Number.MAX_SAFE_INTEGER;
    const versionB =
      typeof b.version === "number" ? b.version : Number.MAX_SAFE_INTEGER;

    if (versionA !== versionB) return versionA - versionB;
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp;
    return a.id.localeCompare(b.id);
  });
}

function mergeRealtimeEvent(
  old: EventResponse,
  event: WorkspaceEvent,
): EventResponse {
  if (old.events.some((existing) => existing.id === event.id)) {
    return old;
  }

  const confirmedEvents = old.events.filter(
    (existing) => typeof existing.version === "number",
  );
  const optimisticEvents = old.events.filter(
    (existing) => typeof existing.version !== "number",
  );

  return {
    ...old,
    events: [
      ...sortConfirmedEvents([...confirmedEvents, event]),
      ...optimisticEvents,
    ],
    version:
      typeof event.version === "number"
        ? Math.max(old.version, event.version)
        : old.version,
  };
}

export function useWorkspaceRealtime(
  workspaceId: string | null,
  options: WorkspaceRealtimeOptions = {},
): WorkspaceRealtimeReturn {
  const queryClient = useQueryClient();
  const channelRef = useRef<RealtimeChannel | null>(null);
  const { onStatusChange, onRemoteEvent } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectNonce, setReconnectNonce] = useState(0);

  const removeChannel = useCallback((channel: RealtimeChannel | null) => {
    if (!channel) return;
    const supabase = getSupabaseClient();
    supabase.removeChannel(channel);
  }, []);

  const cleanup = useCallback(() => {
    if (!channelRef.current) return;

    removeChannel(channelRef.current);
    channelRef.current = null;
    setIsConnected(false);
  }, [removeChannel]);

  useEffect(() => {
    if (!workspaceId) {
      if (channelRef.current) {
        removeChannel(channelRef.current);
        channelRef.current = null;
      }
      onStatusChange?.("disconnected");
      return;
    }

    const supabase = getSupabaseClient();
    const channelName = `workspace:${workspaceId}:events`;
    onStatusChange?.("connecting");

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false },
      },
    });

    channelRef.current = channel;

    channel.on("broadcast", { event: "workspace_event" }, (payload) => {
      const event = payload.payload as WorkspaceEvent;

      if (!event || !event.id) {
        logger.warn(
          "[REALTIME] Ignoring invalid workspace event payload",
          payload,
        );
        return;
      }

      onRemoteEvent?.(event);

      const existing = queryClient.getQueryData<EventResponse>(
        workspaceEventsQueryKey(workspaceId),
      );

      const hasVersionGap =
        !!existing &&
        typeof event.version === "number" &&
        event.version > existing.version + 1;

      queryClient.setQueryData<EventResponse>(
        workspaceEventsQueryKey(workspaceId),
        (old) => {
          if (!old) return old;
          return mergeRealtimeEvent(old, event);
        },
      );
      applyConfirmedWorkspaceEventToStateQuery(queryClient, workspaceId, event);

      if (hasVersionGap) {
        logger.warn("[REALTIME] Detected workspace event version gap", {
          workspaceId,
          eventId: event.id,
          eventVersion: event.version,
          knownVersion: existing.version,
        });

        queryClient.invalidateQueries({
          queryKey: workspaceEventsQueryKey(workspaceId),
        });
      }
    });

    channel.subscribe((status) => {
      switch (status) {
        case "SUBSCRIBED":
          setIsConnected(true);
          onStatusChange?.("connected");
          break;
        case "CHANNEL_ERROR":
          setIsConnected(false);
          onStatusChange?.("error");
          break;
        case "CLOSED":
        case "TIMED_OUT":
          setIsConnected(false);
          onStatusChange?.("disconnected");
          break;
        default:
          onStatusChange?.("connecting");
      }
    });

    return () => {
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
      removeChannel(channel);
      setIsConnected(false);
    };
  }, [
    workspaceId,
    queryClient,
    cleanup,
    onStatusChange,
    onRemoteEvent,
    reconnectNonce,
    removeChannel,
  ]);

  return {
    isConnected: !!workspaceId && isConnected,
    reconnect: useCallback(() => {
      if (!workspaceId) return;
      cleanup();
      setReconnectNonce((value) => value + 1);
    }, [workspaceId, cleanup]),
  };
}
