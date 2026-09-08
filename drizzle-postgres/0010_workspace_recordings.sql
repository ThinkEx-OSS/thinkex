CREATE TABLE "workspace_recordings" (
	"item_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"mime_type" text NOT NULL,
	"status" text DEFAULT 'recording' NOT NULL,
	"object_key" text,
	"size_bytes" integer,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"transcription_attempt" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	CONSTRAINT "workspace_recordings_status_check" CHECK ("workspace_recordings"."status" in ('recording', 'processing', 'ready', 'failed')),
	CONSTRAINT "workspace_recordings_duration_check" CHECK ("workspace_recordings"."duration_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "workspace_items" DROP CONSTRAINT "workspace_items_type_check";--> statement-breakpoint
ALTER TABLE "workspace_recordings" ADD CONSTRAINT "workspace_recordings_item_id_workspace_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."workspace_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_recordings" ADD CONSTRAINT "workspace_recordings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_type_check" CHECK ("workspace_items"."type" in ('folder', 'document', 'flashcard', 'quiz', 'file', 'recording'));