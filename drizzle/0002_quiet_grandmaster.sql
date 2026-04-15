ALTER TABLE "chat_threads" ADD COLUMN "compression_summary" text;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "compressed_up_to_message_id" text;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "last_input_tokens" integer;