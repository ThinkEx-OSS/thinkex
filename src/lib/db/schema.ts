import {
  pgTable,
  index,
  foreignKey,
  pgPolicy,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
  uniqueIndex,
  integer,
  unique,
  bigint,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Better Auth tables
export const user = pgTable(
  "user",
  {
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
  },
  (table) => [
    // Performance optimization: index on email for faster lookups
    index("idx_user_email").using(
      "btree",
      table.email.asc().nullsLast().op("text_ops"),
    ),
  ],
);

export const session = pgTable(
  "session",
  {
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
  },
  (table) => [
    // Performance optimization: indexes for session lookups
    index("idx_session_user_id").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
    ),
    index("idx_session_token").using(
      "btree",
      table.token.asc().nullsLast().op("text_ops"),
    ),
  ],
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
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Performance optimization: index on userId for faster account lookups
    index("idx_account_user_id").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
    ),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // Performance optimization: index on identifier for faster verification lookups
    index("idx_verification_identifier").using(
      "btree",
      table.identifier.asc().nullsLast().op("text_ops"),
    ),
  ],
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: text("user_id").notNull(),
    name: text().notNull(),
    description: text().default(""),
    template: text().default("blank"),
    isPublic: boolean("is_public").default(false),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
    slug: text(),
    icon: text(),
    sortOrder: integer("sort_order"),
    color: text(),
    lastOpenedAt: timestamp("last_opened_at", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (table) => [
    index("idx_workspaces_created_at").using(
      "btree",
      table.createdAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("idx_workspaces_slug").using(
      "btree",
      table.slug.asc().nullsLast().op("text_ops"),
    ),
    index("idx_workspaces_user_id").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
    ),
    uniqueIndex("idx_workspaces_user_slug").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
      table.slug.asc().nullsLast().op("text_ops"),
    ),
    index("idx_workspaces_user_sort_order").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
      table.sortOrder.asc().nullsLast().op("int4_ops"),
    ),
    index("idx_workspaces_last_opened_at").using(
      "btree",
      table.lastOpenedAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    pgPolicy("Users can delete their own workspaces", {
      as: "permissive",
      for: "delete",
      to: ["authenticated"],
      using: sql`(( SELECT (auth.jwt() ->> 'sub'::text)) = user_id)`,
    }),
    pgPolicy("Users can insert their own workspaces", {
      as: "permissive",
      for: "insert",
      to: ["authenticated"],
    }),
    pgPolicy("Users can update their own workspaces", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
    }),
    pgPolicy("Users can view their own workspaces", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
    }),
  ],
);

// workspace_states table removed - current state lives in workspace item tables

// workspace_shares table removed - sharing is now fork-based (users import copies)

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: text("user_id").notNull(),
    onboardingCompleted: boolean("onboarding_completed").default(false),
    onboardingCompletedAt: timestamp("onboarding_completed_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
  },
  (table) => [
    index("idx_user_profiles_user_id").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
    ),
    unique("user_profiles_user_id_key").on(table.userId),
    pgPolicy("Users can insert their own profile", {
      as: "permissive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`(( SELECT (auth.jwt() ->> 'sub'::text)) = user_id)`,
    }),
    pgPolicy("Users can update their own profile", {
      as: "permissive",
      for: "update",
      to: ["authenticated"],
    }),
    pgPolicy("Users can view their own profile", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
    }),
  ],
);

const workspaceItemsReadAccessSql = sql`(EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_items.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_items.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))`;

const workspaceItemsWriteAccessSql = sql`(EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_items.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_items.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))`;

export const workspaceItems = pgTable(
  "workspace_items",
  {
    workspaceId: uuid("workspace_id").notNull(),
    itemId: text("item_id").notNull(),
    type: text().notNull(),
    name: text().notNull(),
    subtitle: text().default("").notNull(),
    color: text(),
    folderId: text("folder_id"),
    layout: jsonb(),
    lastModified: bigint("last_modified", { mode: "number" }),
    sourceVersion: integer("source_version").notNull(),
    dataSchemaVersion: integer("data_schema_version").default(1).notNull(),
    contentHash: text("content_hash").default("").notNull(),
    processingStatus: text("processing_status"),
    hasOcr: boolean("has_ocr").default(false).notNull(),
    ocrStatus: text("ocr_status"),
    ocrPageCount: integer("ocr_page_count").default(0).notNull(),
    hasTranscript: boolean("has_transcript").default(false).notNull(),
    sourceCount: integer("source_count").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.itemId],
      name: "workspace_items_pkey",
    }),
    index("idx_workspace_items_workspace").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    index("idx_workspace_items_workspace_folder").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.folderId.asc().nullsLast().op("text_ops"),
    ),
    index("idx_workspace_items_workspace_type").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.type.asc().nullsLast().op("text_ops"),
    ),
    index("idx_workspace_items_workspace_updated").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.updatedAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    index("idx_workspace_items_workspace_version").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.sourceVersion.desc().nullsFirst().op("int4_ops"),
    ),
    index("idx_workspace_items_workspace_processing").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.processingStatus.asc().nullsLast().op("text_ops"),
    ),
    index("idx_workspace_items_workspace_ocr").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.hasOcr.asc().nullsLast().op("bool_ops"),
      table.ocrStatus.asc().nullsLast().op("text_ops"),
    ),
    index("idx_workspace_items_workspace_ocr_page_count").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.ocrPageCount.asc().nullsLast().op("int4_ops"),
    ),
    index("idx_workspace_items_workspace_has_transcript").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.hasTranscript.asc().nullsLast().op("bool_ops"),
    ),
    index("idx_workspace_items_workspace_source_count").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.sourceCount.desc().nullsFirst().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
      name: "workspace_items_workspace_id_fkey",
    }).onDelete("cascade"),
    pgPolicy("Users can read workspace items they have access to", {
      as: "permissive",
      for: "select",
      to: ["public"],
      using: workspaceItemsReadAccessSql,
    }),
    pgPolicy("Users can write workspace items they have write access to", {
      as: "permissive",
      for: "all",
      to: ["public"],
      using: workspaceItemsWriteAccessSql,
      withCheck: workspaceItemsWriteAccessSql,
    }),
  ],
);

export const workspaceItemContent = pgTable(
  "workspace_item_content",
  {
    workspaceId: uuid("workspace_id").notNull(),
    itemId: text("item_id").notNull(),
    dataSchemaVersion: integer("data_schema_version").default(1).notNull(),
    contentHash: text("content_hash").default("").notNull(),
    textContent: text("text_content"),
    structuredData: jsonb("structured_data"),
    assetData: jsonb("asset_data"),
    embedData: jsonb("embed_data"),
    sourceData: jsonb("source_data"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.itemId],
      name: "workspace_item_content_pkey",
    }),
    index("idx_workspace_item_content_workspace").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId, table.itemId],
      foreignColumns: [workspaceItems.workspaceId, workspaceItems.itemId],
      name: "workspace_item_content_workspace_item_fkey",
    }).onDelete("cascade"),
    pgPolicy("Users can read workspace item content they have access to", {
      as: "permissive",
      for: "select",
      to: ["public"],
      using: sql`(EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_content.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_content.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))`,
    }),
    pgPolicy(
      "Users can write workspace item content they have write access to",
      {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_content.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_content.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))`,
        withCheck: sql`(EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_content.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_content.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))`,
      },
    ),
  ],
);

export const workspaceItemExtracted = pgTable(
  "workspace_item_extracted",
  {
    workspaceId: uuid("workspace_id").notNull(),
    itemId: text("item_id").notNull(),
    searchText: text("search_text").default("").notNull(),
    contentPreview: text("content_preview"),
    ocrText: text("ocr_text"),
    transcriptText: text("transcript_text"),
    ocrPages: jsonb("ocr_pages"),
    transcriptSegments: jsonb("transcript_segments"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.workspaceId, table.itemId],
      name: "workspace_item_extracted_pkey",
    }),
    index("idx_workspace_item_extracted_workspace").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId, table.itemId],
      foreignColumns: [workspaceItems.workspaceId, workspaceItems.itemId],
      name: "workspace_item_extracted_workspace_item_fkey",
    }).onDelete("cascade"),
    pgPolicy(
      "Users can read workspace item extracted data they have access to",
      {
        as: "permissive",
        for: "select",
        to: ["public"],
        using: sql`(EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_extracted.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_extracted.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))`,
      },
    ),
    pgPolicy(
      "Users can write workspace item extracted data they have write access to",
      {
        as: "permissive",
        for: "all",
        to: ["public"],
        using: sql`(EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_extracted.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_extracted.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))`,
        withCheck: sql`(EXISTS ( SELECT 1
   FROM workspaces
  WHERE ((workspaces.id = workspace_item_extracted.workspace_id) AND (workspaces.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_item_extracted.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))`,
      },
    ),
  ],
);


export const workspaceCollaborators = pgTable(
  "workspace_collaborators",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    userId: text("user_id").notNull(),
    permissionLevel: text("permission_level").default("editor").notNull(),
    inviteToken: text("invite_token"),
    lastOpenedAt: timestamp("last_opened_at", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
  },
  (table) => [
    index("idx_workspace_collaborators_lookup").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    index("idx_workspace_collaborators_workspace").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    index("idx_workspace_collaborators_last_opened_at").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
      table.lastOpenedAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
      name: "workspace_collaborators_workspace_id_fkey",
    }).onDelete("cascade"),
    unique("workspace_collaborators_invite_token_unique").on(table.inviteToken),
    unique("workspace_collaborators_workspace_user_unique").on(
      table.workspaceId,
      table.userId,
    ),
    pgPolicy("Owners can manage collaborators", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`(EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_collaborators.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text)))))`,
    }),
    pgPolicy("Collaborators can view their access", {
      as: "permissive",
      for: "select",
      to: ["authenticated"],
      using: sql`(user_id = (auth.jwt() ->> 'sub'::text))`,
    }),
  ],
);

export const workspaceInvites = pgTable(
  "workspace_invites",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    email: text("email").notNull(),
    token: text("token").notNull(),
    inviterId: text("inviter_id").notNull(),
    permissionLevel: text("permission_level").default("editor").notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
  },
  (table) => [
    index("idx_workspace_invites_token").using(
      "btree",
      table.token.asc().nullsLast().op("text_ops"),
    ),
    index("idx_workspace_invites_email").using(
      "btree",
      table.email.asc().nullsLast().op("text_ops"),
    ),
    index("idx_workspace_invites_workspace").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
      name: "workspace_invites_workspace_id_fkey",
    }).onDelete("cascade"),
    unique("workspace_invites_token_key").on(table.token),
    pgPolicy("Public can view invite by token", {
      as: "permissive",
      for: "select",
      to: ["public"],
      using: sql`true`,
    }),
    pgPolicy("Users can insert invites for workspaces they own/edit", {
      as: "permissive",
      for: "insert",
      to: ["authenticated"],
      withCheck: sql`(EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_invites.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_invites.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))`,
    }),
  ],
);

// Multi-use share links: anyone with the link can join (no email restriction)
export const workspaceShareLinks = pgTable(
  "workspace_share_links",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    workspaceId: uuid("workspace_id").notNull(),
    token: text("token").notNull(),
    permissionLevel: text("permission_level").default("editor").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (table) => [
    index("idx_workspace_share_links_token").using(
      "btree",
      table.token.asc().nullsLast().op("text_ops"),
    ),
    index("idx_workspace_share_links_workspace").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    unique("workspace_share_links_token_key").on(table.token),
    unique("workspace_share_links_workspace_key").on(table.workspaceId),
    foreignKey({
      columns: [table.workspaceId],
      foreignColumns: [workspaces.id],
      name: "workspace_share_links_workspace_id_fkey",
    }).onDelete("cascade"),
    pgPolicy("Public can view share link by token", {
      as: "permissive",
      for: "select",
      to: ["public"],
      using: sql`true`,
    }),
    pgPolicy("Owners and editors can manage share links", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`(EXISTS ( SELECT 1
   FROM workspaces w
  WHERE ((w.id = workspace_share_links.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text))))) OR (EXISTS ( SELECT 1
   FROM workspace_collaborators c
  WHERE ((c.workspace_id = workspace_share_links.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)) AND (c.permission_level = 'editor'::text))))`,
    }),
  ],
);

// Chat threads - workspace-scoped conversations
export const chatThreads = pgTable(
  "chat_threads",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    isArchived: boolean("is_archived").default(false),
    externalId: text("external_id"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .$onUpdate(() => new Date().toISOString()),
    lastMessageAt: timestamp("last_message_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
    /** Tip of current branch for threaded conversations; used when loading history. */
    headMessageId: text("head_message_id"),
  },
  (table) => [
    index("idx_chat_threads_workspace").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
    ),
    index("idx_chat_threads_user").using(
      "btree",
      table.userId.asc().nullsLast().op("text_ops"),
    ),
    index("idx_chat_threads_last_message").using(
      "btree",
      table.workspaceId.asc().nullsLast().op("uuid_ops"),
      table.lastMessageAt.desc().nullsFirst().op("timestamptz_ops"),
    ),
    pgPolicy("chat_threads_user_scoped", {
      as: "permissive",
      for: "all",
      to: ["authenticated"],
      using: sql`((chat_threads.user_id = (auth.jwt() ->> 'sub'::text))
   AND ((EXISTS ( SELECT 1 FROM workspaces w
   WHERE ((w.id = chat_threads.workspace_id) AND (w.user_id = (auth.jwt() ->> 'sub'::text)))))
   OR (EXISTS ( SELECT 1 FROM workspace_collaborators c
   WHERE ((c.workspace_id = chat_threads.workspace_id) AND (c.user_id = (auth.jwt() ->> 'sub'::text)))))))`,
    }),
  ],
);

// Chat messages - stored per thread
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    messageId: text("message_id").notNull(),
    parentId: text("parent_id"),
    format: text("format").notNull(),
    content: jsonb().notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
  },
  (table) => [
    unique("chat_messages_thread_message_key").on(
      table.threadId,
      table.messageId,
    ),
    index("idx_chat_messages_thread").using(
      "btree",
      table.threadId.asc().nullsLast().op("uuid_ops"),
    ),
    index("idx_chat_messages_thread_created").using(
      "btree",
      table.threadId.asc().nullsLast().op("uuid_ops"),
      table.createdAt.asc().nullsLast().op("timestamptz_ops"),
    ),
  ],
);
