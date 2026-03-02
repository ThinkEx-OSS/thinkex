-- User-scoped chat threads: users can only see/manage their own threads
-- Collaborators no longer see each other's threads

DROP POLICY IF EXISTS "Users can manage threads in their workspaces" ON "chat_threads";
CREATE POLICY "Users can manage their own threads in workspaces they access" ON "chat_threads" AS PERMISSIVE FOR ALL TO "authenticated" USING (
  (chat_threads.user_id = (auth.jwt() ->> 'sub'))
  AND (
    (EXISTS ( SELECT 1 FROM workspaces w
       WHERE ((w.id = chat_threads.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text)))))
    OR (EXISTS ( SELECT 1 FROM workspace_collaborators c
       WHERE ((c.workspace_id = chat_threads.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))
  )
);

DROP POLICY IF EXISTS "Users can manage reads for threads in their workspaces" ON "workspace_item_reads";
CREATE POLICY "Users can manage reads for their own threads in workspaces they access" ON "workspace_item_reads" AS PERMISSIVE FOR ALL TO "authenticated" USING (
  (EXISTS ( SELECT 1 FROM chat_threads ct
     JOIN workspaces w ON w.id = ct.workspace_id
     WHERE ((ct.id = workspace_item_reads.thread_id) AND (ct.user_id = (auth.jwt() ->> 'sub'::text)) AND (w.user_id = (auth.jwt() ->> 'sub'::text)))))
  OR (EXISTS ( SELECT 1 FROM chat_threads ct
     JOIN workspace_collaborators c ON c.workspace_id = ct.workspace_id
     WHERE ((ct.id = workspace_item_reads.thread_id) AND (ct.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))
);
