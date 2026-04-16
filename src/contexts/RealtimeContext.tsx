/**
 * Workspace Realtime Context
 *
 * Provides real-time collaboration state to workspace components.
 * Combines subscription (events) and presence (locks/users) hooks.
 */

"use client";

import React, { createContext, useContext, useMemo } from "react";
import { useConnectionState } from "@rocicorp/zero/react";
import {
  useWorkspacePresence,
  type CollaboratorPresence,
} from "@/hooks/workspace/use-workspace-presence";
import { useSession } from "@/lib/auth-client";

interface RealtimeContextType {
  /** Connection status for realtime sync */
  connectionStatus: "connecting" | "connected" | "disconnected" | "error";
  /** Collaborators currently in the workspace */
  collaborators: CollaboratorPresence[];
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

interface RealtimeProviderProps {
  children: React.ReactNode;
  workspaceId: string | null;
}

/**
 * Provider that sets up realtime subscription and presence for a workspace
 */
export function RealtimeProvider({
  children,
  workspaceId,
}: RealtimeProviderProps) {
  const { data: session } = useSession();
  const zeroConnectionState = useConnectionState();

  const connectionStatus = useMemo<RealtimeContextType["connectionStatus"]>(
    () => {
      switch (zeroConnectionState.name) {
        case "connected":
          return "connected";
        case "connecting":
          return "connecting";
        default:
          return "disconnected";
      }
    },
    [zeroConnectionState],
  );

  // Current user info for presence
  const currentUser = session?.user
    ? {
        id: session.user.id,
        name: session.user.name || "Anonymous",
        image: session.user.image ?? undefined,
      }
    : null;

  // Track presence (which users are in workspace)
  const { collaborators } = useWorkspacePresence(workspaceId, {
    currentUser,
  });

  const value = useMemo<RealtimeContextType>(
    () => ({
      connectionStatus,
      collaborators,
    }),
    [connectionStatus, collaborators],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * Hook to access realtime collaboration state
 */
export function useRealtimeContext() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtimeContext must be used within RealtimeProvider");
  }
  return context;
}

/**
 * Optional hook that returns null if not inside provider
 * Useful for components that may or may not be inside a collaborative workspace
 */
export function useRealtimeContextOptional() {
  return useContext(RealtimeContext);
}
