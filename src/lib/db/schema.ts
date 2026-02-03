import { pgTable, index, foreignKey, pgPolicy, uuid, text, jsonb, timestamp, boolean, uniqueIndex, integer, unique, check, bigint } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// Better Auth tables
export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name"),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	isAnonymous: boolean("is_anonymous").default(false),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}, (table) => [
	// Performance optimization: index on email for faster lookups
	index("idx_user_email").using("btree", table.email.asc().nullsLast().op("text_ops")),
]);

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => new Date())
		.notNull(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
}, (table) => [
	// Performance optimization: indexes for session lookups
	index("idx_session_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("idx_session_token").using("btree", table.token.asc().nullsLast().op("text_ops")),
]);

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.$onUpdate(() => new Date())
		.notNull(),
}, (table) => [
	// Performance optimization: index on userId for faster account lookups
	index("idx_account_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date())
		.notNull(),
}, (table) => [
	// Performance optimization: index on identifier for faster verification lookups
	index("idx_verification_identifier").using("btree", table.identifier.asc().nullsLast().op("text_ops")),
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
	index("idx_workspaces_slug").using("btree", table.slug.asc().nullsLast().op("text_ops")),
	index("idx_workspaces_user_id").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	uniqueIndex("idx_workspaces_user_slug").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.slug.asc().nullsLast().op("text_ops")),
	index("idx_workspaces_user_sort_order").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	index("idx_workspaces_last_opened_at").using("btree", table.lastOpenedAt.desc().nullsFirst().op("timestamptz_ops")),
	pgPolicy("Users can delete their own workspaces", { as: "permissive", for: "delete", to: ["authenticated"], using: sql`(( SELECT (auth.jwt() ->> 'sub'::text)) = user_id)` }),
	pgPolicy("Users can insert their own workspaces", { as: "permissive", for: "insert", to: ["authenticated"] }),
	pgPolicy("Users can update their own workspaces", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can view their own workspaces", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

// workspace_states table removed - state is now managed via event sourcing


// workspace_shares table removed - sharing is now fork-based (users import copies)



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
	pgPolicy("Users can insert their own profile", { as: "permissive", for: "insert", to: ["authenticated"], withCheck: sql`(( SELECT (auth.jwt() ->> 'sub'::text)) = user_id)` }),
	pgPolicy("Users can update their own profile", { as: "permissive", for: "update", to: ["authenticated"] }),
	pgPolicy("Users can view their own profile", { as: "permissive", for: "select", to: ["authenticated"] }),
]);

export const workspaceSnapshots = pgTable("workspace_snapshots", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	snapshotVersion: integer("snapshot_version").notNull(),
	state: jsonb().notNull(),
	eventCount: integer("event_count").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_workspace_snapshots_version").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops"), table.snapshotVersion.desc().nullsFirst().op("int4_ops")),
	index("idx_workspace_snapshots_workspace").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
		columns: [table.workspaceId],
		foreignColumns: [workspaces.id],
		name: "workspace_snapshots_workspace_id_fkey"
	}).onDelete("cascade"),
	unique("workspace_snapshots_workspace_id_snapshot_version_key").on(table.workspaceId, table.snapshotVersion),
	pgPolicy("Service role can insert workspace snapshots", { as: "permissive", for: "insert", to: ["public"], withCheck: sql`true` }),
	pgPolicy("Users can read workspace snapshots they have access to", { as: "permissive", for: "select", to: ["public"] }),
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
	index("idx_workspace_events_timestamp").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops"), table.timestamp.asc().nullsLast().op("int8_ops")),
	index("idx_workspace_events_user_name").using("btree", table.userName.asc().nullsLast().op("text_ops")),
	index("idx_workspace_events_workspace").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops"), table.version.asc().nullsLast().op("int4_ops")),
	foreignKey({
		columns: [table.workspaceId],
		foreignColumns: [workspaces.id],
		name: "workspace_events_workspace_id_fkey"
	}).onDelete("cascade"),
	unique("workspace_events_event_id_key").on(table.eventId),
	pgPolicy("Users can insert workspace events they have write access to", {
		as: "permissive", for: "insert", to: ["public"], withCheck: sql`(EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_events.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_events.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))`  }),
	pgPolicy("Users can read workspace events they have access to", {
		as: "permissive", for: "select", to: ["public"], using: sql`(EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_events.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_events.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))`  }),
]);

export const workspaceCollaborators = pgTable("workspace_collaborators", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	workspaceId: uuid("workspace_id").notNull(),
	userId: text("user_id").notNull(),
	permissionLevel: text("permission_level").default('editor').notNull(),
	inviteToken: text("invite_token"),
	lastOpenedAt: timestamp("last_opened_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_workspace_collaborators_lookup").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.workspaceId.asc().nullsLast().op("uuid_ops")),
	index("idx_workspace_collaborators_workspace").using("btree", table.workspaceId.asc().nullsLast().op("uuid_ops")),
	index("idx_workspace_collaborators_last_opened_at").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.lastOpenedAt.desc().nullsFirst().op("timestamptz_ops")),
	foreignKey({
		columns: [table.workspaceId],
		foreignColumns: [workspaces.id],
		name: "workspace_collaborators_workspace_id_fkey"
	}).onDelete("cascade"),
	unique("workspace_collaborators_invite_token_unique").on(table.inviteToken),
	unique("workspace_collaborators_workspace_user_unique").on(table.workspaceId, table.userId),
	pgPolicy("Owners can manage collaborators", {
		as: "permissive", for: "all", to: ["authenticated"], using: sql`(EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_collaborators.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text)))))`  }),
	pgPolicy("Collaborators can view their access", { as: "permissive", for: "select", to: ["authenticated"], using: sql`(user_id = (auth.jwt() ->> 'sub'::text))` }),
]);
