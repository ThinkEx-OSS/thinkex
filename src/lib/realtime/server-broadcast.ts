import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/utils/logger";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import { sanitizeWorkspaceEventForClient } from "@/lib/workspace/client-safe-events";

let realtimeBroadcastClient: SupabaseClient | null = null;
let didWarnMissingEnv = false;

function getRealtimeBroadcastClient(): SupabaseClient | null {
  if (realtimeBroadcastClient) {
    return realtimeBroadcastClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    if (!didWarnMissingEnv) {
      didWarnMissingEnv = true;
      logger.warn(
        "[REALTIME] Missing Supabase env for server broadcasts; skipping workspace event broadcast",
      );
    }
    return null;
  }

  realtimeBroadcastClient = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return realtimeBroadcastClient;
}

export async function broadcastWorkspaceEventFromServer(
  workspaceId: string,
  event: WorkspaceEvent,
): Promise<void> {
  const supabase = getRealtimeBroadcastClient();
  if (!supabase) return;

  const channel = supabase.channel(`workspace:${workspaceId}:events`);

  try {
    // REST broadcast from the server (no WebSocket). See https://supabase.com/docs/guides/realtime/broadcast
    const result = await channel.httpSend(
      "workspace_event",
      sanitizeWorkspaceEventForClient(event),
    );
    if (!result.success) {
      logger.error("[REALTIME] httpSend broadcast failed", {
        workspaceId,
        eventId: event.id,
        eventType: event.type,
        status: result.status,
        error: result.error,
      });
    }
  } catch (error) {
    logger.error("[REALTIME] Failed to broadcast workspace event from server", {
      workspaceId,
      eventId: event.id,
      eventType: event.type,
      error,
    });
  } finally {
    await supabase.removeChannel(channel);
  }
}
