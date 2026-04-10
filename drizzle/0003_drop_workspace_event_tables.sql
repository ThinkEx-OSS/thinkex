-- Drop user state table (user state persistence removed entirely)
DROP TABLE IF EXISTS workspace_item_user_state;

-- Drop projection state table (no longer needed - Zero syncs directly)
DROP TABLE IF EXISTS workspace_item_projection_state;

-- Drop events table (no longer needed - no event sourcing)
DROP TABLE IF EXISTS workspace_events;
