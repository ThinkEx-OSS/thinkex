-- Old realtime trigger from event-sourcing era
DROP TRIGGER IF EXISTS workspace_events_realtime_broadcast ON workspace_events;
--> statement-breakpoint

-- Old event-sourcing functions
DROP FUNCTION IF EXISTS workspace_events_broadcast_trigger();
--> statement-breakpoint
DROP FUNCTION IF EXISTS append_workspace_event(uuid, text, text, jsonb, bigint, text, integer, text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS create_workspace_snapshot(uuid, jsonb, integer, integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS get_latest_snapshot(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS get_latest_snapshot_fast(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS get_workspace_events_fast(uuid, integer, integer);
--> statement-breakpoint
DROP FUNCTION IF EXISTS get_workspace_version(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS needs_snapshot(uuid, integer);
--> statement-breakpoint

-- Orphaned deep-research rate-limit helpers (reference non-existent deep_research_usage table)
DROP FUNCTION IF EXISTS reserve_deep_research_usage(text, uuid, text, integer, bigint);
--> statement-breakpoint
DROP FUNCTION IF EXISTS complete_deep_research_usage(uuid, text);
--> statement-breakpoint
DROP FUNCTION IF EXISTS fail_deep_research_usage(uuid);
--> statement-breakpoint
DROP FUNCTION IF EXISTS cleanup_failed_deep_research_reservations(integer);
--> statement-breakpoint

-- Drop dependent tables before parents to avoid CASCADE noise
DROP TABLE IF EXISTS workspace_item_user_state;
--> statement-breakpoint
DROP TABLE IF EXISTS workspace_item_projection_state;
--> statement-breakpoint
DROP TABLE IF EXISTS chat_v2_message;
--> statement-breakpoint
DROP TABLE IF EXISTS chat_v2;
--> statement-breakpoint
DROP TABLE IF EXISTS workspace_snapshots;
--> statement-breakpoint
DROP TABLE IF EXISTS workspace_events;
--> statement-breakpoint

-- Stale columns on chat_threads (all 0 populated rows, no code references)
ALTER TABLE chat_threads DROP COLUMN IF EXISTS compression_summary;
--> statement-breakpoint
ALTER TABLE chat_threads DROP COLUMN IF EXISTS compressed_up_to_message_id;
--> statement-breakpoint
ALTER TABLE chat_threads DROP COLUMN IF EXISTS last_input_tokens;
