CREATE INDEX "idx_account_user_id" ON "account" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_session_user_id" ON "session" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "idx_session_token" ON "session" USING btree ("token" text_ops);--> statement-breakpoint
CREATE INDEX "idx_user_email" ON "user" USING btree ("email" text_ops);--> statement-breakpoint
CREATE INDEX "idx_verification_identifier" ON "verification" USING btree ("identifier" text_ops);