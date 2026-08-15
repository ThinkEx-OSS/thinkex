import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	unique,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { WORKSPACE_ITEM_TYPES } from "#/features/workspaces/workspace-item-registry";

const WORKSPACE_ROLES = ["owner", "admin", "editor", "viewer"] as const;
const WORKSPACE_INVITE_TYPES = ["email", "link"] as const;
const WORKSPACE_INVITE_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;
const WORKSPACE_RELATION_KINDS = ["derived_from", "references"] as const;
const WORKSPACE_EXTRACTION_STATUSES = ["processing", "ready", "failed"] as const;
const WORKSPACE_EXTRACTION_TIERS = ["fast", "enhanced"] as const;

function sqlEnumValues(values: readonly string[]) {
	return sql.raw(values.map((value) => `'${value.replaceAll("'", "''")}'`).join(", "));
}

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").default(false).notNull(),
	image: text("image"),
	isAnonymous: boolean("is_anonymous").default(false),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const session = pgTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		token: text("token").notNull().unique(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
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

export const account = pgTable(
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
		accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
		refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
		scope: text("scope"),
		password: text("password"),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = pgTable("rate_limit", {
	id: text("id").primaryKey(),
	key: text("key").notNull().unique(),
	count: integer("count").notNull(),
	lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

export const jwks = pgTable("jwks", {
	id: text("id").primaryKey(),
	publicKey: text("public_key").notNull(),
	privateKey: text("private_key").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export const oauthClient = pgTable(
	"oauth_client",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id").notNull().unique(),
		clientSecret: text("client_secret"),
		disabled: boolean("disabled").default(false),
		skipConsent: boolean("skip_consent"),
		enableEndSession: boolean("enable_end_session"),
		subjectType: text("subject_type"),
		scopes: jsonb("scopes").$type<string[]>(),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }),
		updatedAt: timestamp("updated_at", { withTimezone: true }),
		name: text("name"),
		uri: text("uri"),
		icon: text("icon"),
		contacts: jsonb("contacts").$type<string[]>(),
		tos: text("tos"),
		policy: text("policy"),
		softwareId: text("software_id"),
		softwareVersion: text("software_version"),
		softwareStatement: text("software_statement"),
		redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
		postLogoutRedirectUris: jsonb("post_logout_redirect_uris").$type<string[]>(),
		tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
		grantTypes: jsonb("grant_types").$type<string[]>(),
		responseTypes: jsonb("response_types").$type<string[]>(),
		public: boolean("public"),
		type: text("type"),
		requirePKCE: boolean("require_pkce"),
		referenceId: text("reference_id"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
	},
	(table) => [index("oauth_client_user_id_idx").on(table.userId)],
);

export const oauthRefreshToken = pgTable(
	"oauth_refresh_token",
	{
		id: text("id").primaryKey(),
		token: text("token").notNull().unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		revoked: timestamp("revoked", { withTimezone: true }),
		authTime: timestamp("auth_time", { withTimezone: true }),
		scopes: jsonb("scopes").$type<string[]>().notNull(),
	},
	(table) => [
		index("oauth_refresh_token_client_id_idx").on(table.clientId),
		index("oauth_refresh_token_session_id_idx").on(table.sessionId),
		index("oauth_refresh_token_user_id_idx").on(table.userId),
	],
);

export const oauthAccessToken = pgTable(
	"oauth_access_token",
	{
		id: text("id").primaryKey(),
		token: text("token").notNull().unique(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		sessionId: text("session_id").references(() => session.id, { onDelete: "set null" }),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		refreshId: text("refresh_id").references(() => oauthRefreshToken.id, {
			onDelete: "cascade",
		}),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		scopes: jsonb("scopes").$type<string[]>().notNull(),
	},
	(table) => [
		index("oauth_access_token_client_id_idx").on(table.clientId),
		index("oauth_access_token_session_id_idx").on(table.sessionId),
		index("oauth_access_token_user_id_idx").on(table.userId),
		index("oauth_access_token_refresh_id_idx").on(table.refreshId),
	],
);

export const oauthConsent = pgTable(
	"oauth_consent",
	{
		id: text("id").primaryKey(),
		clientId: text("client_id")
			.notNull()
			.references(() => oauthClient.clientId, { onDelete: "cascade" }),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		referenceId: text("reference_id"),
		scopes: jsonb("scopes").$type<string[]>().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		index("oauth_consent_client_id_idx").on(table.clientId),
		index("oauth_consent_user_id_idx").on(table.userId),
	],
);

export const workspaces = pgTable(
	"workspaces",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		icon: text("icon"),
		color: text("color"),
		theme: text("theme"),
		description: text("description"),
		revision: integer("revision").default(0).notNull(),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		archivedAt: timestamp("archived_at", { withTimezone: true }),
	},
	(table) => [
		index("workspaces_owner_id_idx").on(table.ownerId),
		index("workspaces_archived_at_idx").on(table.archivedAt),
	],
);

export const workspaceItems = pgTable(
	"workspace_items",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id")
			.notNull()
			.references(() => workspaces.id, { onDelete: "cascade" }),
		parentId: text("parent_id"),
		type: text("type", { enum: WORKSPACE_ITEM_TYPES }).notNull(),
		name: text("name").notNull(),
		nameKey: text("name_key").notNull(),
		// Short, stable, model-facing handle. The volatile default backfills
		// existing rows from a ~47-bit alphanumeric space (base64 of random
		// bytes, +/ mapped to letters) so the unique index cannot trip over
		// hex-only birthday collisions; application code supplies 62^8 nanoid
		// values on insert.
		refKey: text("ref_key")
			.notNull()
			.default(
				sql`substr(translate(encode(decode(md5(gen_random_uuid()::text), 'hex'), 'base64'), '+/', 'Aa'), 1, 8)`,
			),
		color: text("color"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
		sortOrder: integer("sort_order").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.workspaceId, table.parentId],
			foreignColumns: [table.workspaceId, table.id],
			name: "workspace_items_parent_fk",
		}).onDelete("cascade"),
		check(
			"workspace_items_type_check",
			sql`${table.type} in (${sqlEnumValues(WORKSPACE_ITEM_TYPES)})`,
		),
		unique("workspace_items_workspace_id_id_unique").on(table.workspaceId, table.id),
		index("workspace_items_tree_idx").on(table.workspaceId, table.parentId, table.sortOrder),
		index("workspace_items_type_idx").on(table.workspaceId, table.type),
		uniqueIndex("workspace_items_ref_key_unique").on(table.workspaceId, table.refKey),
		uniqueIndex("workspace_items_root_name_unique")
			.on(table.workspaceId, table.nameKey)
			.where(sql`${table.parentId} is null`),
		uniqueIndex("workspace_items_parent_name_unique")
			.on(table.workspaceId, table.parentId, table.nameKey)
			.where(sql`${table.parentId} is not null`),
	],
);

export const workspaceItemContents = pgTable("workspace_item_contents", {
	itemId: text("item_id")
		.primaryKey()
		.references(() => workspaceItems.id, { onDelete: "cascade" }),
	content: text("content").notNull(),
});

export const workspaceItemUserStates = pgTable(
	"workspace_item_user_states",
	{
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		itemId: text("item_id")
			.notNull()
			.references(() => workspaceItems.id, { onDelete: "cascade" }),
		state: jsonb("state").$type<Record<string, unknown>>().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.itemId] }),
		index("workspace_item_user_states_item_id_idx").on(table.itemId),
	],
);

export const workspaceFileAssets = pgTable("workspace_file_assets", {
	itemId: text("item_id")
		.primaryKey()
		.references(() => workspaceItems.id, { onDelete: "cascade" }),
	sourceObjectKey: text("source_object_key").notNull().unique(),
	sourceHash: text("source_hash").notNull(),
	originalName: text("original_name").notNull(),
	mimeType: text("mime_type").notNull(),
	sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
	previewObjectKey: text("preview_object_key").notNull().unique(),
	previewSizeBytes: bigint("preview_size_bytes", { mode: "number" }).notNull(),
});

export const workspaceItemRelations = pgTable(
	"workspace_item_relations",
	{
		id: text("id").primaryKey(),
		workspaceId: text("workspace_id").notNull(),
		fromItemId: text("from_item_id").notNull(),
		toItemId: text("to_item_id").notNull(),
		kind: text("kind", { enum: WORKSPACE_RELATION_KINDS }).notNull(),
		note: text("note").default("").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.workspaceId, table.fromItemId],
			foreignColumns: [workspaceItems.workspaceId, workspaceItems.id],
			name: "workspace_item_relations_from_fk",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.workspaceId, table.toItemId],
			foreignColumns: [workspaceItems.workspaceId, workspaceItems.id],
			name: "workspace_item_relations_to_fk",
		}).onDelete("cascade"),
		check(
			"workspace_item_relations_kind_check",
			sql`${table.kind} in (${sqlEnumValues(WORKSPACE_RELATION_KINDS)})`,
		),
		uniqueIndex("workspace_item_relations_unique").on(
			table.fromItemId,
			table.toItemId,
			table.kind,
			table.note,
		),
		index("workspace_item_relations_from_idx").on(table.fromItemId, table.createdAt),
		index("workspace_item_relations_to_idx").on(table.toItemId, table.createdAt),
	],
);

export const workspaceItemExtractions = pgTable(
	"workspace_item_extractions",
	{
		workspaceId: text("workspace_id").notNull(),
		itemId: text("item_id").primaryKey(),
		status: text("status", { enum: WORKSPACE_EXTRACTION_STATUSES }).notNull(),
		provider: text("provider"),
		providerMode: text("provider_mode"),
		tier: text("tier", { enum: WORKSPACE_EXTRACTION_TIERS }),
		errorMessage: text("error_message"),
		sourceHash: text("source_hash"),
		metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.workspaceId, table.itemId],
			foreignColumns: [workspaceItems.workspaceId, workspaceItems.id],
			name: "workspace_item_extractions_item_fk",
		}).onDelete("cascade"),
		check(
			"workspace_item_extractions_status_check",
			sql`${table.status} in (${sqlEnumValues(WORKSPACE_EXTRACTION_STATUSES)})`,
		),
		check(
			"workspace_item_extractions_tier_check",
			sql`${table.tier} is null or ${table.tier} in (${sqlEnumValues(WORKSPACE_EXTRACTION_TIERS)})`,
		),
		index("workspace_item_extractions_status_idx").on(
			table.workspaceId,
			table.status,
			table.updatedAt,
		),
	],
);

export const workspaceItemPages = pgTable(
	"workspace_item_pages",
	{
		itemId: text("item_id")
			.notNull()
			.references(() => workspaceItems.id, { onDelete: "cascade" }),
		pageNumber: integer("page_number").notNull(),
		markdown: text("markdown").notNull(),
		markdownBytes: integer("markdown_bytes").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.itemId, table.pageNumber] }),
		check("workspace_item_pages_number_check", sql`${table.pageNumber} > 0`),
		check("workspace_item_pages_bytes_check", sql`${table.markdownBytes} >= 0`),
	],
);

export const workspaceMembers = pgTable(
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
		lastOpenedAt: timestamp("last_opened_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
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

export const workspaceInvites = pgTable(
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
		expiresAt: timestamp("expires_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
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
