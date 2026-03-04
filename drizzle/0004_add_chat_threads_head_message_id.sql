-- Persist current branch tip for threaded conversations; used when loading history.
ALTER TABLE "chat_threads" ADD COLUMN "head_message_id" text;
