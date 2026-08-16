CREATE TABLE "ai_chat_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"media_type" text NOT NULL,
	"file_name" text,
	"size_bytes" integer NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chat_attachments" ADD CONSTRAINT "ai_chat_attachments_thread_id_ai_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_chat_attachments_thread_id_idx" ON "ai_chat_attachments" USING btree ("thread_id");