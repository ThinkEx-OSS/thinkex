/**
 * Real-time workspace subscription hook
 * 
 * Uses Supabase Realtime Broadcast for simple pub/sub messaging.
 * Clients broadcast events after successfully saving them, and other clients receive them.
 * This avoids the complexity of DB triggers + RLS on realtime.messages.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/lib/supabase-client';
import type { EventResponse, WorkspaceEvent } from '@/lib/workspace/events';

interface WorkspaceRealtimeOptions {
    /** Current user ID to filter out own events */
    currentUserId?: string | null;
    /** Called when connection status changes */
    onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;
    /** Called when a remote event is received */
    onRemoteEvent?: (event: WorkspaceEvent) => void;
}

interface WorkspaceRealtimeReturn {
    isConnected: boolean;
    /** Broadcast an event to other clients */
    broadcastEvent: (event: WorkspaceEvent) => Promise<void>;
    /** Force reconnect to the channel */
    reconnect: () => void;
}

/**
 * Hook to subscribe to real-time workspace events using client-side Broadcast
 * 
 * This is a simple pub/sub pattern:
 * 1. All clients subscribe to same channel
 * 2. When a client saves an event, it broadcasts to the channel
 * 3. Other clients receive the broadcast and update their cache
 */
export function useWorkspaceRealtime(
    workspaceId: string | null,
    options: WorkspaceRealtimeOptions = {}
): WorkspaceRealtimeReturn {
    const queryClient = useQueryClient();
    const channelRef = useRef<RealtimeChannel | null>(null);
    const { currentUserId, onStatusChange, onRemoteEvent } = options;
    const [isConnected, setIsConnected] = useState(false);

    // Clean up channel on unmount or workspaceId change
    const cleanup = useCallback(() => {
        if (channelRef.current) {
            console.log('[REALTIME] Cleaning up channel');
            const supabase = getSupabaseClient();
            supabase.removeChannel(channelRef.current);
            channelRef.current = null;
            setIsConnected(false);
        }
    }, []);

    useEffect(() => {
        if (!workspaceId) {
            cleanup();
            return;
        }

        const supabase = getSupabaseClient();
        // Use colon format to match RLS policies in database
        const channelName = `workspace:${workspaceId}:events`;

        console.log('[REALTIME] Subscribing to channel:', channelName);

        // Create a public broadcast channel (no RLS needed)
        const channel = supabase.channel(channelName, {
            config: {
                broadcast: { self: false }, // Don't receive our own broadcasts
            },
        });

        channelRef.current = channel;

        // Listen for workspace events broadcast by other clients
        channel.on('broadcast', { event: 'workspace_event' }, (payload) => {
            console.log('[REALTIME] Received workspace_event:', payload);

            const event = payload.payload as WorkspaceEvent;

            if (!event || !event.id) {
                console.warn('[REALTIME] Invalid event payload:', payload);
                return;
            }

            // Skip our own events (though self: false should handle this)
            if (currentUserId && event.userId === currentUserId) {
                console.log('[REALTIME] Skipping own event');
                return;
            }

            // Notify callback
            onRemoteEvent?.(event);

            // Merge into React Query cache
            queryClient.setQueryData<EventResponse>(
                ['workspace', workspaceId, 'events'],
                (old) => {
                    if (!old) {
                        console.log('[REALTIME] No existing cache to update');
                        return old;
                    }

                    // Check if event already exists (by id)
                    const exists = old.events.some((e) => e.id === event.id);
                    if (exists) {
                        console.log('[REALTIME] Event already exists, skipping');
                        return old;
                    }

                    console.log('[REALTIME] Adding event to cache, new version:', Math.max(old.version, event.version || 0));

                    return {
                        ...old,
                        events: [...old.events, event],
                        version: Math.max(old.version, event.version || 0),
                    };
                }
            );
        });

        // Subscribe to channel
        channel.subscribe((status) => {
            console.log('[REALTIME] Channel status:', status);
            switch (status) {
                case 'SUBSCRIBED':
                    setIsConnected(true);
                    onStatusChange?.('connected');
                    break;
                case 'CHANNEL_ERROR':
                    setIsConnected(false);
                    onStatusChange?.('error');
                    break;
                case 'CLOSED':
                case 'TIMED_OUT':
                    setIsConnected(false);
                    onStatusChange?.('disconnected');
                    break;
                default:
                    onStatusChange?.('connecting');
            }
        });

        return cleanup;
    }, [workspaceId, currentUserId, queryClient, cleanup, onStatusChange, onRemoteEvent]);

    // Broadcast an event to other clients
    const broadcastEvent = useCallback(async (event: WorkspaceEvent) => {
        if (!channelRef.current) {
            console.log('[REALTIME] Cannot broadcast - channel not initialized');
            return;
        }

        // Supabase allows broadcasting via HTTP if not connected via WebSocket
        if (!isConnected) {
            console.log('[REALTIME] Broadcasting via HTTP fallback (not fully connected yet)');
        }

        try {
            const result = await channelRef.current.send({
                type: 'broadcast',
                event: 'workspace_event',
                payload: event,
            });
            console.log('[REALTIME] Broadcast result:', result, 'Event:', event.type);
        } catch (err) {
            console.error('[REALTIME] Failed to broadcast:', err);
        }
    }, [isConnected]);

    return {
        isConnected,
        broadcastEvent,
        reconnect: useCallback(() => {
            if (!workspaceId) return;
            cleanup();
        }, [workspaceId, cleanup]),
    };
}
