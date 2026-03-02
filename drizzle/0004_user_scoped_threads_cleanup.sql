
-- Chat threads: drop any existing variants, create short-named policy
DROP POLICY IF EXISTS "Users can manage threads in their workspaces" ON "chat_threads";
DROP POLICY IF EXISTS "Users can manage their own threads in workspaces they access" ON "chat_threads";
DROP POLICY IF EXISTS "Users can manage their own threads in workspaces they" ON "chat_threads";
DROP POLICY IF EXISTS "chat_threads_user_scoped" ON "chat_threads";

CREATE POLICY "chat_threads_user_scoped" ON "chat_threads" AS PERMISSIVE FOR ALL TO "authenticated" USING (
  (chat_threads.user_id = (auth.jwt() ->> 'sub'))
  AND (
    (EXISTS ( SELECT 1 FROM workspaces w
       WHERE ((w.id = chat_threads.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text)))))
    OR (EXISTS ( SELECT 1 FROM workspace_collaborators c
       WHERE ((c.workspace_id = chat_threads.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))
  )
);

-- Workspace item reads: drop any existing variants, create short-named policy
DROP POLICY IF EXISTS "Users can manage reads for threads in their workspaces" ON "workspace_item_reads";
DROP POLICY IF EXISTS "Users can manage reads for their own threads in workspaces they access" ON "workspace_item_reads";
DROP POLICY IF EXISTS "Users can manage reads for their own threads in workspaces they" ON "workspace_item_reads";
DROP POLICY IF EXISTS "workspace_item_reads_user_scoped" ON "workspace_item_reads";

CREATE POLICY "workspace_item_reads_user_scoped" ON "workspace_item_reads" AS PERMISSIVE FOR ALL TO "authenticated" USING (
  (EXISTS ( SELECT 1 FROM chat_threads ct
     JOIN workspaces w ON w.id = ct.workspace_id
     WHERE ((ct.id = workspace_item_reads.thread_id) AND (ct.user_id = (auth.jwt() ->> 'sub'::text)) AND (w.user_id = (auth.jwt() ->> 'sub'::text)))))
  OR (EXISTS ( SELECT 1 FROM chat_threads ct
     JOIN workspace_collaborators c ON c.workspace_id = ct.workspace_id
     WHERE ((ct.id = workspace_item_reads.thread_id) AND (ct.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))
);
