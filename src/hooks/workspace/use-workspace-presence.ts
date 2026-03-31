/**
 * Workspace Presence Hook
 *
 * Tracks which users are in a workspace.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase-client";

export interface CollaboratorPresence {
  userId: string;
  userName: string;
  userImage?: string;
  joinedAt: string;
}

interface PresencePayload extends CollaboratorPresence {
  clientKey: string;
}

interface UseWorkspacePresenceOptions {
  currentUser: {
    id: string;
    name: string;
    image?: string;
  } | null;
}

interface UseWorkspacePresenceReturn {
  collaborators: CollaboratorPresence[];
}

export function useWorkspacePresence(
  workspaceId: string | null,
  options: UseWorkspacePresenceOptions,
): UseWorkspacePresenceReturn {
  const { currentUser } = options;
  const currentUserId = currentUser?.id ?? null;
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>(
    [],
  );
  const channelRef = useRef<RealtimeChannel | null>(null);
  const joinedAtRef = useRef(new Date().toISOString());
  const clientKey = useMemo(
    () => (currentUserId ? `${currentUserId}:${crypto.randomUUID()}` : null),
    [currentUserId],
  );

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      const supabase = getSupabaseClient();
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!workspaceId || !currentUser || !clientKey) {
      cleanup();
      return;
    }

    const supabase = getSupabaseClient();
    const channel = supabase.channel(`workspace:${workspaceId}:presence`, {
      config: {
        presence: {
          key: clientKey,
        },
      },
    });

    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<PresencePayload>();
      const dedupedUsers = new Map<string, CollaboratorPresence>();

      for (const presences of Object.values(state)) {
        const presence = presences[0];
        if (!presence || presence.userId === currentUser.id) continue;

        if (!dedupedUsers.has(presence.userId)) {
          dedupedUsers.set(presence.userId, {
            userId: presence.userId,
            userName: presence.userName,
            userImage: presence.userImage,
            joinedAt: presence.joinedAt,
          });
        }
      }

      setCollaborators(Array.from(dedupedUsers.values()));
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({
          clientKey,
          userId: currentUser.id,
          userName: currentUser.name,
          userImage: currentUser.image,
          joinedAt: joinedAtRef.current,
        });
      }
    });

    return cleanup;
  }, [workspaceId, currentUser, cleanup, clientKey]);

  return {
    collaborators: workspaceId && currentUser ? collaborators : [],
  };
}
