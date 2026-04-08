CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"parent_id" text,
	"format" text NOT NULL,
	"content" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "chat_messages_thread_message_key" UNIQUE("thread_id","message_id")
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"is_archived" boolean DEFAULT false,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"last_message_at" timestamp with time zone DEFAULT now(),
	"head_message_id" text
);
--> statement-breakpoint
ALTER TABLE "chat_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"is_anonymous" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"onboarding_completed" boolean DEFAULT false,
	"onboarding_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_profiles_user_id_key" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_collaborators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"permission_level" text DEFAULT 'editor' NOT NULL,
	"invite_token" text,
	"last_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "workspace_collaborators_invite_token_unique" UNIQUE("invite_token"),
	CONSTRAINT "workspace_collaborators_workspace_user_unique" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_collaborators" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"timestamp" bigint NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"user_name" text,
	CONSTRAINT "workspace_events_event_id_key" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"inviter_id" text NOT NULL,
	"permission_level" text DEFAULT 'editor' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "workspace_invites_token_key" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "workspace_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"token" text NOT NULL,
	"permission_level" text DEFAULT 'editor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "workspace_share_links_token_key" UNIQUE("token"),
	CONSTRAINT "workspace_share_links_workspace_key" UNIQUE("workspace_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_share_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspace_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"snapshot_version" integer NOT NULL,
	"state" jsonb NOT NULL,
	"event_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "workspace_snapshots_workspace_id_snapshot_version_key" UNIQUE("workspace_id","snapshot_version")
);
--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '',
	"template" text DEFAULT 'blank',
	"is_public" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	"slug" text,
	"icon" text,
	"sort_order" integer,
	"color" text,
	"last_opened_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_collaborators" ADD CONSTRAINT "workspace_collaborators_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_events" ADD CONSTRAINT "workspace_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_share_links" ADD CONSTRAINT "workspace_share_links_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_snapshots" ADD CONSTRAINT "workspace_snapshots_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_account_user_id" ON "account" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_chat_messages_thread" ON "chat_messages" USING btree ("thread_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_chat_messages_thread_created" ON "chat_messages" USING btree ("thread_id" uuid_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_chat_threads_workspace" ON "chat_threads" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_chat_threads_user" ON "chat_threads" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_chat_threads_last_message" ON "chat_threads" USING btree ("workspace_id" uuid_ops,"last_message_at" timestamptz_ops DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_session_user_id" ON "session" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_session_token" ON "session" USING btree ("token" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_email" ON "user" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_profiles_user_id" ON "user_profiles" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_collaborators_lookup" ON "workspace_collaborators" USING btree ("user_id" text_ops,"workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_collaborators_workspace" ON "workspace_collaborators" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_collaborators_last_opened_at" ON "workspace_collaborators" USING btree ("user_id" text_ops,"last_opened_at" timestamptz_ops DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_workspace_events_event_id" ON "workspace_events" USING btree ("event_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_events_timestamp" ON "workspace_events" USING btree ("workspace_id" uuid_ops,"timestamp" int8_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_events_user_name" ON "workspace_events" USING btree ("user_name" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_events_workspace" ON "workspace_events" USING btree ("workspace_id" uuid_ops,"version" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_invites_token" ON "workspace_invites" USING btree ("token" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_invites_email" ON "workspace_invites" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_invites_workspace" ON "workspace_invites" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_share_links_token" ON "workspace_share_links" USING btree ("token" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_share_links_workspace" ON "workspace_share_links" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workspace_snapshots_version" ON "workspace_snapshots" USING btree ("workspace_id" uuid_ops,"snapshot_version" int4_ops DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_workspace_snapshots_workspace" ON "workspace_snapshots" USING btree ("workspace_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workspaces_created_at" ON "workspaces" USING btree ("created_at" timestamptz_ops DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "idx_workspaces_slug" ON "workspaces" USING btree ("slug" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspaces_user_id" ON "workspaces" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_workspaces_user_slug" ON "workspaces" USING btree ("user_id" text_ops,"slug" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workspaces_user_sort_order" ON "workspaces" USING btree ("user_id" text_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_workspaces_last_opened_at" ON "workspaces" USING btree ("last_opened_at" timestamptz_ops DESC NULLS FIRST);--> statement-breakpoint
CREATE POLICY "chat_threads_user_scoped" ON "chat_threads" AS PERMISSIVE FOR ALL TO "authenticated" USING (((chat_threads.user_id = (auth.jwt() ->> 'sub'::text))
   AND ((EXISTS ( SELECT 1 FROM workspaces w
   WHERE ((w.id = chat_threads.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text)))))
   OR (EXISTS ( SELECT 1 FROM workspace_collaborators c
   WHERE ((c.workspace_id = chat_threads.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))))));--> statement-breakpoint
CREATE POLICY "Users can insert their own profile" ON "user_profiles" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((( SELECT (auth.jwt() ->> 'sub'::text)) = user_id));--> statement-breakpoint
CREATE POLICY "Users can update their own profile" ON "user_profiles" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can view their own profile" ON "user_profiles" AS PERMISSIVE FOR SELECT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Owners can manage collaborators" ON "workspace_collaborators" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_collaborators.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint
CREATE POLICY "Collaborators can view their access" ON "workspace_collaborators" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((user_id = (auth.jwt() ->> 'sub'::text)));--> statement-breakpoint
CREATE POLICY "Users can insert workspace events they have write access to" ON "workspace_events" AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_events.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_events.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));--> statement-breakpoint
CREATE POLICY "Users can read workspace events they have access to" ON "workspace_events" AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_events.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_events.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));--> statement-breakpoint
-- Preserve realtime collaboration objects that were previously created outside the journal
CREATE OR REPLACE FUNCTION workspace_events_broadcast_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'workspace:' || NEW.workspace_id::text || ':events',
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NEW,
    OLD
  );
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER workspace_events_realtime_broadcast
  AFTER INSERT ON workspace_events
  FOR EACH ROW EXECUTE FUNCTION workspace_events_broadcast_trigger();--> statement-breakpoint
CREATE POLICY "workspace_access_can_read" ON realtime.messages
FOR SELECT TO authenticated
USING (
  topic LIKE 'workspace:%:events'
  AND (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = (SPLIT_PART(topic, ':', 2))::uuid
        AND w.user_id = (auth.jwt() ->> 'sub'::text)
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_collaborators c
      WHERE c.workspace_id = (SPLIT_PART(topic, ':', 2))::uuid
        AND c.user_id = (auth.jwt() ->> 'sub'::text)
    )
  )
);--> statement-breakpoint
CREATE POLICY "workspace_access_can_write" ON realtime.messages
FOR INSERT TO authenticated
WITH CHECK (
  topic LIKE 'workspace:%:events'
  AND (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = (SPLIT_PART(topic, ':', 2))::uuid
        AND w.user_id = (auth.jwt() ->> 'sub'::text)
    )
    OR
    EXISTS (
      SELECT 1 FROM public.workspace_collaborators c
      WHERE c.workspace_id = (SPLIT_PART(topic, ':', 2))::uuid
        AND c.user_id = (auth.jwt() ->> 'sub'::text)
        AND c.permission_level = 'editor'
    )
  )
);--> statement-breakpoint
CREATE POLICY "Public can view invite by token" ON "workspace_invites" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "Users can insert invites for workspaces they own/edit" ON "workspace_invites" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_invites.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_invites.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));--> statement-breakpoint
CREATE POLICY "Public can view share link by token" ON "workspace_share_links" AS PERMISSIVE FOR SELECT TO public USING (true);--> statement-breakpoint
CREATE POLICY "Owners and editors can manage share links" ON "workspace_share_links" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_share_links.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_share_links.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))));--> statement-breakpoint
CREATE POLICY "Service role can insert workspace snapshots" ON "workspace_snapshots" AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "Users can read workspace snapshots they have access to" ON "workspace_snapshots" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Users can delete their own workspaces" ON "workspaces" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((( SELECT (auth.jwt() ->> 'sub'::text)) = user_id));--> statement-breakpoint
CREATE POLICY "Users can insert their own workspaces" ON "workspaces" AS PERMISSIVE FOR INSERT TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can update their own workspaces" ON "workspaces" AS PERMISSIVE FOR UPDATE TO "authenticated";--> statement-breakpoint
CREATE POLICY "Users can view their own workspaces" ON "workspaces" AS PERMISSIVE FOR SELECT TO "authenticated";