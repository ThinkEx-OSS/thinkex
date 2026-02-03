/**
 * Workspace Presence Hook
 * 
 * Tracks which users are in a workspace.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase-client';

export interface CollaboratorPresence {
    userId: string;
    userName: string;
    userImage?: string;
    /** When the user joined */
    joinedAt: string;
}

interface UseWorkspacePresenceOptions {
    /** Current user info */
    currentUser: {
        id: string;
        name: string;
        image?: string;
    } | null;
}

interface UseWorkspacePresenceReturn {
    /** All collaborators currently in the workspace (excluding current user) */
    collaborators: CollaboratorPresence[];
}

/**
 * Hook to track presence in a workspace
 * Uses Supabase Realtime Presence to sync user state
 */
export function useWorkspacePresence(
    workspaceId: string | null,
    options: UseWorkspacePresenceOptions
): UseWorkspacePresenceReturn {
    const { currentUser } = options;
    const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
    const channelRef = useRef<RealtimeChannel | null>(null);
    // Keep joinedAt stable across re-renders
    const joinedAtRef = useRef(new Date().toISOString());

    // Clean up channel
    const cleanup = useCallback(() => {
        if (channelRef.current) {
            const supabase = getSupabaseClient();
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
        }
    }, []);

    // Initialize presence channel
    useEffect(() => {
        if (!workspaceId || !currentUser) {
            cleanup();
            setCollaborators([]);
            return;
        }

        const supabase = getSupabaseClient();
        const channelName = `workspace:${workspaceId}:presence`;

        const channel = supabase.channel(channelName, {
            config: {
                presence: {
                    key: currentUser.id,
                },
            },
        });

        channelRef.current = channel;

        // Handle presence sync
        channel.on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState<CollaboratorPresence>();

            // Flatten presence state and filter out current user
            const otherUsers: CollaboratorPresence[] = [];
            for (const [userId, presences] of Object.entries(state)) {
                if (userId !== currentUser.id && presences.length > 0) {
                    otherUsers.push(presences[0]);
                }
            }

            setCollaborators(otherUsers);
        });

        // Subscribe and track presence
        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await channel.track({
                    userId: currentUser.id,
                    userName: currentUser.name,
                    userImage: currentUser.image,
                    joinedAt: joinedAtRef.current,
                });
            }
        });

        return cleanup;
    }, [workspaceId, currentUser?.id, cleanup]);

    // Update presence when user info changes
    useEffect(() => {
        const channel = channelRef.current;
        if (!channel || !currentUser) return;

        channel.track({
            userId: currentUser.id,
            userName: currentUser.name,
            userImage: currentUser.image,
            joinedAt: joinedAtRef.current,
        });
    }, [currentUser]);

    return {
        collaborators,
    };
}
