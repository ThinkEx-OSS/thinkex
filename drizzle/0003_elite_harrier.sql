CREATE TABLE "workspace_item_reads" (
	"thread_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"last_modified" bigint NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_item_reads_thread_item_key" UNIQUE("thread_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_item_reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_item_reads" ADD CONSTRAINT "workspace_item_reads_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_workspace_item_reads_thread_item" ON "workspace_item_reads" USING btree ("thread_id" uuid_ops,"item_id" text_ops);--> statement-breakpoint
CREATE POLICY "Users can manage reads for threads in their workspaces" ON "workspace_item_reads" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1 FROM chat_threads ct
   JOIN workspaces w ON w.id = ct.workspace_id
   WHERE ((ct.id = workspace_item_reads.thread_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text)))))
   OR (EXISTS ( SELECT 1 FROM chat_threads ct
   JOIN workspace_collaborators c ON c.workspace_id = ct.workspace_id
   WHERE ((ct.id = workspace_item_reads.thread_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text))))));