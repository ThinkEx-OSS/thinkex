ALTER TABLE "workspace_items" ADD COLUMN "ref_key" text DEFAULT substr(translate(encode(decode(md5(gen_random_uuid()::text), 'hex'), 'base64'), '+/', 'Aa'), 1, 8) NOT NULL;--> statement-breakpoint
UPDATE "workspace_items" w SET "ref_key" = substr(translate(encode(decode(md5(gen_random_uuid()::text || w.id), 'hex'), 'base64'), '+/', 'Aa'), 1, 8)
WHERE EXISTS (
	SELECT 1 FROM "workspace_items" d
	WHERE d."workspace_id" = w."workspace_id" AND d."ref_key" = w."ref_key" AND d."id" <> w."id"
);--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_items_ref_key_unique" ON "workspace_items" USING btree ("workspace_id","ref_key");