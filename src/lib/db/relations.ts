import { relations } from "drizzle-orm/relations";
import {
  workspaces,
  workspaceEvents,
  workspaceItems,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItemProjectionState,
  workspaceItemUserState,
  chatThreads,
  chatMessages,
} from "./schema";

// workspace_shares removed - sharing is now fork-based (users import copies)

export const workspacesRelations = relations(workspaces, ({ many, one }) => ({
  workspaceEvents: many(workspaceEvents),
  workspaceItems: many(workspaceItems),
  workspaceItemContent: many(workspaceItemContent),
  workspaceItemExtracted: many(workspaceItemExtracted),
  workspaceItemUserState: many(workspaceItemUserState),
  workspaceItemProjectionState: one(workspaceItemProjectionState),
}));

export const workspaceEventsRelations = relations(
  workspaceEvents,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceEvents.workspaceId],
      references: [workspaces.id],
    }),
  }),
);

export const workspaceItemsRelations = relations(
  workspaceItems,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [workspaceItems.workspaceId],
      references: [workspaces.id],
    }),
    workspaceItemContent: many(workspaceItemContent),
    workspaceItemExtracted: many(workspaceItemExtracted),
    workspaceItemUserState: many(workspaceItemUserState),
  }),
);

export const workspaceItemContentRelations = relations(
  workspaceItemContent,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceItemContent.workspaceId],
      references: [workspaces.id],
    }),
    workspaceItem: one(workspaceItems, {
      fields: [workspaceItemContent.workspaceId, workspaceItemContent.itemId],
      references: [workspaceItems.workspaceId, workspaceItems.itemId],
    }),
  }),
);

export const workspaceItemExtractedRelations = relations(
  workspaceItemExtracted,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceItemExtracted.workspaceId],
      references: [workspaces.id],
    }),
    workspaceItem: one(workspaceItems, {
      fields: [
        workspaceItemExtracted.workspaceId,
        workspaceItemExtracted.itemId,
      ],
      references: [workspaceItems.workspaceId, workspaceItems.itemId],
    }),
  }),
);

export const workspaceItemUserStateRelations = relations(
  workspaceItemUserState,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceItemUserState.workspaceId],
      references: [workspaces.id],
    }),
    workspaceItem: one(workspaceItems, {
      fields: [
        workspaceItemUserState.workspaceId,
        workspaceItemUserState.itemId,
      ],
      references: [workspaceItems.workspaceId, workspaceItems.itemId],
    }),
  }),
);

export const workspaceItemProjectionStateRelations = relations(
  workspaceItemProjectionState,
  ({ one }) => ({
    workspace: one(workspaces, {
      fields: [workspaceItemProjectionState.workspaceId],
      references: [workspaces.id],
    }),
  }),
);

export const chatThreadsRelations = relations(chatThreads, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [chatThreads.workspaceId],
    references: [workspaces.id],
  }),
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  thread: one(chatThreads, {
    fields: [chatMessages.threadId],
    references: [chatThreads.id],
  }),
}));
