import { relations } from "drizzle-orm/relations";
import {
  workspaces,
  workspaceItems,
  workspaceItemContent,
  workspaceItemExtracted,
  chatThreads,
  chatMessages,
} from "./schema";

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  workspaceItems: many(workspaceItems),
  workspaceItemContent: many(workspaceItemContent),
  workspaceItemExtracted: many(workspaceItemExtracted),
}));

export const workspaceItemsRelations = relations(
  workspaceItems,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [workspaceItems.workspaceId],
      references: [workspaces.id],
    }),
    workspaceItemContent: many(workspaceItemContent),
    workspaceItemExtracted: many(workspaceItemExtracted),
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
