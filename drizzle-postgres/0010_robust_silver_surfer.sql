CREATE TABLE "workspace_recording_segments" (
	"recording_item_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"etag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_recording_segments_recording_item_id_sequence_pk" PRIMARY KEY("recording_item_id","sequence"),
	CONSTRAINT "workspace_recording_segments_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "workspace_recording_segments_sequence_check" CHECK ("workspace_recording_segments"."sequence" >= 0),
	CONSTRAINT "workspace_recording_segments_size_check" CHECK ("workspace_recording_segments"."size_bytes" > 0),
	CONSTRAINT "workspace_recording_segments_duration_check" CHECK ("workspace_recording_segments"."duration_ms" > 0)
);
--> statement-breakpoint
CREATE TABLE "workspace_recordings" (
	"item_id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"mime_type" text NOT NULL,
	"status" text DEFAULT 'recording' NOT NULL,
	"expected_segment_count" integer,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"workflow_id" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_recordings_workflow_id_unique" UNIQUE("workflow_id"),
	CONSTRAINT "workspace_recordings_status_check" CHECK ("workspace_recordings"."status" in ('recording', 'processing', 'ready', 'failed')),
	CONSTRAINT "workspace_recordings_duration_check" CHECK ("workspace_recordings"."duration_ms" >= 0),
	CONSTRAINT "workspace_recordings_segment_count_check" CHECK ("workspace_recordings"."expected_segment_count" is null or "workspace_recordings"."expected_segment_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "workspace_items" DROP CONSTRAINT "workspace_items_type_check";--> statement-breakpoint
ALTER TABLE "workspace_recording_segments" ADD CONSTRAINT "workspace_recording_segments_recording_item_id_workspace_recordings_item_id_fk" FOREIGN KEY ("recording_item_id") REFERENCES "public"."workspace_recordings"("item_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_recordings" ADD CONSTRAINT "workspace_recordings_item_id_workspace_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."workspace_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_recordings" ADD CONSTRAINT "workspace_recordings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_recordings" ADD CONSTRAINT "workspace_recordings_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_recordings_workspace_status_idx" ON "workspace_recordings" USING btree ("workspace_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "workspace_recordings_owner_idx" ON "workspace_recordings" USING btree ("owner_id","updated_at");--> statement-breakpoint
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_type_check" CHECK ("workspace_items"."type" in ('folder', 'document', 'flashcard', 'quiz', 'file', 'recording'));