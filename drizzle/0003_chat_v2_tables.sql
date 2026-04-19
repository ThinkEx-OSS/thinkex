CREATE TABLE "chat_v2" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text DEFAULT 'New chat' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_v2_message" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chat_id" uuid NOT NULL,
	"role" text NOT NULL,
	"parts" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_v2" ADD CONSTRAINT "chat_v2_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "chat_v2_message" ADD CONSTRAINT "chat_v2_message_chat_id_chat_v2_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat_v2"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_chat_v2_user_updated" ON "chat_v2" USING btree ("user_id" text_ops,"updated_at" timestamptz_ops);
--> statement-breakpoint
CREATE INDEX "idx_chat_v2_message_chat_created" ON "chat_v2_message" USING btree ("chat_id" uuid_ops,"created_at" timestamptz_ops);
