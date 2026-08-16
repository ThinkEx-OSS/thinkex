CREATE TABLE "ai_chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "ai_chat_messages_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"metadata" jsonb,
	"status" text DEFAULT 'complete' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_chat_messages_role_check" CHECK ("ai_chat_messages"."role" in ('user', 'assistant', 'system')),
	CONSTRAINT "ai_chat_messages_status_check" CHECK ("ai_chat_messages"."status" in ('streaming', 'complete', 'interrupted'))
);
--> statement-breakpoint
CREATE TABLE "ai_chat_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text,
	"active_stream_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_chat_messages" ADD CONSTRAINT "ai_chat_messages_thread_id_ai_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."ai_chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_threads" ADD CONSTRAINT "ai_chat_threads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_chat_threads" ADD CONSTRAINT "ai_chat_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_chat_messages_thread_seq_unique" ON "ai_chat_messages" USING btree ("thread_id","seq");--> statement-breakpoint
CREATE INDEX "ai_chat_threads_user_id_idx" ON "ai_chat_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_chat_threads_workspace_id_idx" ON "ai_chat_threads" USING btree ("workspace_id");