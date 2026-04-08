import { pgTable, index, foreignKey, unique, uuid, text, jsonb, timestamp, pgPolicy, boolean, bigint, integer, uniqueIndex, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const chatMessages = pgTable("chat_messages", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	threadId: uuid("thread_id").notNull(),
	messageId: text("message_id").notNull(),
	parentId: text("parent_id"),
	format: text().notNull(),
	content: jsonb().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_chat_messages_thread").using("btree", table.threadId.asc().nullsLast().op("uuid_ops")),
	index("idx_chat_messages_thread_created").using("btree", table.threadId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.threadId],
			foreignColumns: [chatThreads.id],
			name: "chat_messages_thread_id_chat_threads_id_fk"
		}).onDelete("cascade"),
	unique("chat_messages_thread_message_key").on(table.threadId, table.messageId),
]);

export const chatThreads = pgTable("chat_threads", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	userId: text("user_id").notNull(),
	title: text(),
	isArchived: boolean("is_archived").default(false),
	externalId: text("external_id"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	lastMessageAt: timestamp("last_message_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	headMessageId: text("head_message_id"),
}, (table) => [
	index("idx_chat_threads_last_message").using("btree", table.workspaceId.asc().nullsLast().op("timestamptz_ops"), table.lastMessageAt.asc().nullsLast().op("uuid_ops")),
	index("idx_chat_threads_user").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_chat_threads_workspace").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "chat_threads_user_id_user_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "chat_threads_workspace_id_workspaces_id_fk"
		}).onDelete("cascade"),
	pgPolicy("chat_threads_user_scoped", { as: "permissive", for: "all", to: ["authenticated"], using: sql`((user_id = (auth.jwt() ->> 'sub'::text)) AND ((EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = chat_threads.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = chat_threads.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))))` }),
]);

export const workspaceShareLinks = pgTable("workspace_share_links", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	token: text().notNull(),
	permissionLevel: text("permission_level").default('editor').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("idx_workspace_share_links_token").using("btree", table.token.asc().nullsLast().op("text_ops")),
	index("idx_workspace_share_links_workspace").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_share_links_workspace_id_fkey"
		}).onDelete("cascade"),
	unique("workspace_share_links_workspace_key").on(table.workspaceId),
	unique("workspace_share_links_token_key").on(table.token),
	pgPolicy("Public can view share link by token", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Owners and editors can manage share links", { as: "permissive", for: "all", to: ["authenticated"] }),
]);

export const workspaceCollaborators = pgTable("workspace_collaborators", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	userId: text("user_id").notNull(),
	permissionLevel: text("permission_level").default('editor').notNull(),
	inviteToken: text("invite_token"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	lastOpenedAt: timestamp("last_opened_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_workspace_collaborators_last_opened_at").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.lastOpenedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_workspace_collaborators_lookup").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.workspaceId.asc().nullsLast().op("uuid_ops")),
	index("idx_workspace_collaborators_workspace").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_collaborators_workspace_id_fkey"
		}).onDelete("cascade"),
	unique("workspace_collaborators_workspace_user_unique").on(table.workspaceId, table.userId),
	unique("workspace_collaborators_invite_token_unique").on(table.inviteToken),
	pgPolicy("Owners can manage collaborators", { as: "permissive", for: "all", to: ["authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_collaborators.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text)))))` }),
	pgPolicy("Collaborators can view their access", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const user = pgTable("user", {
	id: text().primaryKey().notNull(),
	name: text(),
	email: text().notNull(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
	isAnonymous: boolean("is_anonymous").default(false),
}, (table) => [
	index("idx_user_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	unique("user_email_unique").on(table.email),
]);

export const account = pgTable("account", {
	id: text().primaryKey().notNull(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id").notNull(),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at", { mode: 'string' }),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { mode: 'string' }),
	scope: text(),
	password: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
}, (table) => [
	index("idx_account_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "account_user_id_user_id_fk"
		}).onDelete("cascade"),
]);

export const session = pgTable("session", {
	id: text().primaryKey().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	token: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id").notNull(),
}, (table) => [
	index("idx_session_token").using("btree", table.token.asc().nullsLast().op("text_ops")),
	index("idx_session_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [user.id],
			name: "session_user_id_user_id_fk"
		}).onDelete("cascade"),
	unique("session_token_unique").on(table.token),
]);

export const userProfiles = pgTable("user_profiles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	onboardingCompleted: boolean("onboarding_completed").default(false),
	onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_user_profiles_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	unique("user_profiles_user_id_key").on(table.userId),
	pgPolicy("Users can insert their own profile", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(( SELECT (auth.jwt() ->> 'sub'::text)) = user_id)`  }),
	pgPolicy("Users can update their own profile", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can view their own profile", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const verification = pgTable("verification", {
	id: text().primaryKey().notNull(),
	identifier: text().notNull(),
	value: text().notNull(),
	expiresAt: timestamp("expires_at", { mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_verification_identifier").using("btree", table.identifier.asc().nullsLast().op("text_ops")),
]);

export const workspaceEvents = pgTable("workspace_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	eventId: text("event_id").notNull(),
	eventType: text("event_type").notNull(),
	payload: jsonb().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	timestamp: bigint({ mode: "number" }).notNull(),
	userId: text("user_id").notNull(),
	version: integer().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	userName: text("user_name"),
}, (table) => [
	index("idx_workspace_events_event_id").using("btree", table.eventId.asc().nullsLast().op("text_ops")),
	index("idx_workspace_events_timestamp").using("btree", table.workspaceId.asc().nullsLast().op("int8_ops"), table.timestamp.asc().nullsLast().op("int8_ops")),
	index("idx_workspace_events_user_name").using("btree", table.userName.asc().nullsLast().op("text_ops")),
	index("idx_workspace_events_workspace").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops"), table.version.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_events_workspace_id_fkey"
		}).onDelete("cascade"),
	unique("workspace_events_event_id_key").on(table.eventId),
	pgPolicy("Users can insert workspace events they have write access to", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`((EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_events.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_events.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text)))))`  }),
	pgPolicy("Users can read workspace events they have access to", { as: "permissive", for: "select", to: ["public"] }),
]);

export const workspaces = pgTable("workspaces", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: text("user_id").notNull(),
	name: text().notNull(),
	description: text().default(''),
	template: text().default('blank'),
	isPublic: boolean("is_public").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	slug: text(),
	icon: text(),
	sortOrder: integer("sort_order"),
	color: text(),
	lastOpenedAt: timestamp("last_opened_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("idx_workspaces_created_at").using("btree", table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("idx_workspaces_last_opened_at").using("btree", table.lastOpenedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_workspaces_slug").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	index("idx_workspaces_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	uniqueIndex("idx_workspaces_user_slug").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.slug.asc().nullsLast().op("text_ops")),
	index("idx_workspaces_user_sort_order").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	pgPolicy("Users can delete their own workspaces", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`(( SELECT (auth.jwt() ->> 'sub'::text)) = user_id)` }),
	pgPolicy("Users can insert their own workspaces", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Users can update their own workspaces", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can view their own workspaces", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const workspaceSnapshots = pgTable("workspace_snapshots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	snapshotVersion: integer("snapshot_version").notNull(),
	state: jsonb().notNull(),
	eventCount: integer("event_count").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_workspace_snapshots_version").using("btree", table.workspaceId.asc().nullsLast().op("int4_ops"), table.snapshotVersion.desc().nullsFirst().op("uuid_ops")),
	index("idx_workspace_snapshots_workspace").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_snapshots_workspace_id_fkey"
		}).onDelete("cascade"),
	unique("workspace_snapshots_workspace_id_snapshot_version_key").on(table.workspaceId, table.snapshotVersion),
	pgPolicy("Service role can insert workspace snapshots", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`true`  }),
	pgPolicy("Users can read workspace snapshots they have access to", { as: "permissive", for: "select", to: ["public"] }),
]);

export const workspaceInvites = pgTable("workspace_invites", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	email: text().notNull(),
	token: text().notNull(),
	inviterId: text("inviter_id").notNull(),
	permissionLevel: text("permission_level").default('editor').notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_workspace_invites_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
	index("idx_workspace_invites_token").using("btree", table.token.asc().nullsLast().op("text_ops")),
	index("idx_workspace_invites_workspace").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_invites_workspace_id_fkey"
		}).onDelete("cascade"),
	unique("workspace_invites_token_key").on(table.token),
	pgPolicy("Public can view invite by token", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Users can insert invites for workspaces they own/edit", { as: "permissive", for: "insert", to: ["authenticated"] }),
]);

export const workspaceItems = pgTable("workspace_items", {
	workspaceId: uuid("workspace_id").notNull(),
	itemId: text("item_id").notNull(),
	type: text().notNull(),
	name: text().notNull(),
	subtitle: text().default('').notNull(),
	data: jsonb().notNull(),
	color: text(),
	folderId: text("folder_id"),
	layout: jsonb(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	lastModified: bigint("last_modified", { mode: "number" }),
	sourceVersion: integer("source_version").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("idx_workspace_items_workspace").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	index("idx_workspace_items_workspace_folder").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops"), table.folderId.asc().nullsLast().op("uuid_ops")),
	index("idx_workspace_items_workspace_type").using("btree", table.workspaceId.asc().nullsLast().op("text_ops"), table.type.asc().nullsLast().op("text_ops")),
	index("idx_workspace_items_workspace_updated").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops"), table.updatedAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_workspace_items_workspace_version").using("btree", table.workspaceId.asc().nullsLast().op("int4_ops"), table.sourceVersion.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: "workspace_items_workspace_id_fkey"
		}).onDelete("cascade"),
	primaryKey({ columns: [table.workspaceId, table.itemId], name: "workspace_items_pkey"}),
	pgPolicy("Users can read projected workspace items they have access to", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Users can write projected workspace items they have write acces", { as: "permissive", for: "all", to: ["public"] }),
]);
