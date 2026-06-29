import { relations, sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const WORKSPACE_ROLES = ["owner", "admin", "editor", "viewer"] as const;
const WORKSPACE_INVITE_TYPES = ["email", "link"] as const;
const WORKSPACE_INVITE_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;

function sqlEnumValues(values: readonly string[]) {
	return sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "));
}

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
	image: text("image"),
	isAnonymous: integer("is_anonymous", { mode: "boolean" }).default(false),
	createdAt: integer("created_at", { mode: "timestamp" })
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.$defaultFn(() => /* @__PURE__ */ new Date())
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const session = sqliteTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: integer("access_token_expires_at", {
			mode: "timestamp",
		}),
		refreshTokenExpiresAt: integer("refresh_token_expires_at", {
			mode: "timestamp",
		}),
		scope: text("scope"),
		password: text("password"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const workspaces = sqliteTable(
	"workspaces",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		icon: text("icon"),
		color: text("color"),
		description: text("description"),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		archivedAt: integer("archived_at", { mode: "timestamp" }),
	},
	(table) => [
		index("workspaces_owner_id_idx").on(table.ownerId),
		index("workspaces_archived_at_idx").on(table.archivedAt),
	],
);

export const workspaceMembers = sqliteTable(
	"workspace_members",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: text("role", { enum: WORKSPACE_ROLES }).default("viewer").notNull(),
		lastOpenedAt: integer("last_opened_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("workspace_members_workspace_user_unique").on(table.workspaceId, table.userId),
		check(
			"workspace_members_role_check",
			sql`${table.role} in (${sqlEnumValues(WORKSPACE_ROLES)})`,
		),
		index("workspace_members_user_id_idx").on(table.userId),
		index("workspace_members_user_last_opened_at_idx").on(table.userId, table.lastOpenedAt),
	],
);

export const workspaceInvites = sqliteTable(
	"workspace_invites",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		role: text("role", { enum: WORKSPACE_ROLES }).notNull(),
		type: text("type", { enum: WORKSPACE_INVITE_TYPES }).notNull(),
		status: text("status", { enum: WORKSPACE_INVITE_STATUSES }).default("pending").notNull(),
		email: text("email"),
		token: text("token"),
		createdByUserId: text("created_by_user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		expiresAt: integer("expires_at", { mode: "timestamp" }),
		createdAt: integer("created_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp" })
			.$defaultFn(() => /* @__PURE__ */ new Date())
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("workspace_invites_token_unique").on(table.token),
		check(
			"workspace_invites_role_check",
			sql`${table.role} in (${sqlEnumValues(WORKSPACE_ROLES)})`,
		),
		check(
			"workspace_invites_type_check",
			sql`${table.type} in (${sqlEnumValues(WORKSPACE_INVITE_TYPES)})`,
		),
		check(
			"workspace_invites_status_check",
			sql`${table.status} in (${sqlEnumValues(WORKSPACE_INVITE_STATUSES)})`,
		),
		uniqueIndex("workspace_invites_pending_link_per_role")
			.on(table.workspaceId, table.role)
			.where(sql`${table.type} = 'link' and ${table.status} = 'pending'`),
		uniqueIndex("workspace_invites_pending_email_per_workspace")
			.on(table.workspaceId, table.email)
			.where(sql`${table.type} = 'email' and ${table.status} = 'pending'`),
		index("workspace_invites_workspace_id_idx").on(table.workspaceId),
		index("workspace_invites_created_by_user_id_idx").on(table.createdByUserId),
	],
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	ownedWorkspaces: many(workspaces),
	workspaceMemberships: many(workspaceMembers),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

export const workspaceRelations = relations(workspaces, ({ one, many }) => ({
	owner: one(user, {
		fields: [workspaces.ownerId],
		references: [user.id],
	}),
	members: many(workspaceMembers),
	invites: many(workspaceInvites),
}));

export const workspaceMemberRelations = relations(workspaceMembers, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [workspaceMembers.workspaceId],
		references: [workspaces.id],
	}),
	user: one(user, {
		fields: [workspaceMembers.userId],
		references: [user.id],
	}),
}));

export const workspaceInviteRelations = relations(workspaceInvites, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [workspaceInvites.workspaceId],
		references: [workspaces.id],
	}),
	createdBy: one(user, {
		fields: [workspaceInvites.createdByUserId],
		references: [user.id],
	}),
}));
