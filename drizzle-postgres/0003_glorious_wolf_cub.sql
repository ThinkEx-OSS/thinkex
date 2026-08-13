CREATE TABLE "workspace_item_user_states" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_item_user_states_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_items" DROP CONSTRAINT "workspace_items_type_check";--> statement-breakpoint
ALTER TABLE "workspace_item_user_states" ADD CONSTRAINT "workspace_item_user_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_item_user_states" ADD CONSTRAINT "workspace_item_user_states_item_id_workspace_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."workspace_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_items" ADD CONSTRAINT "workspace_items_type_check" CHECK ("workspace_items"."type" in ('folder', 'document', 'flashcard', 'file'));
