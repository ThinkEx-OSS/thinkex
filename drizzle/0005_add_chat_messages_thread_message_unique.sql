-- Ensure headMessageId maps to exactly one row; prevent duplicate (thread_id, message_id).
-- Note: If duplicates exist, run a de-dupe (e.g. keep earliest created_at) before migrating.
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_message_key" UNIQUE ("thread_id", "message_id");
