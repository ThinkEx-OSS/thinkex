import { relations } from "drizzle-orm/relations";
import {
  workspaces,
  workspaceSnapshots,
  workspaceEvents,
	workspaceItems,
	workspaceItemProjectionState,
  chatThreads,
  chatMessages,
  workspaceItemReads,
} from "./schema";

// workspace_shares removed - sharing is now fork-based (users import copies)

export const workspacesRelations = relations(workspaces, ({ many }) => ({
	workspaceSnapshots: many(workspaceSnapshots),
	workspaceEvents: many(workspaceEvents),
	workspaceItems: many(workspaceItems),
}));

export const workspaceSnapshotsRelations = relations(workspaceSnapshots, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [workspaceSnapshots.workspaceId],
		references: [workspaces.id]
	}),
}));

export const workspaceEventsRelations = relations(workspaceEvents, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [workspaceEvents.workspaceId],
		references: [workspaces.id]
	}),
}));

export const workspaceItemsRelations = relations(workspaceItems, ({ one }) => ({
	workspace: one(workspaces, {
		fields: [workspaceItems.workspaceId],
		references: [workspaces.id],
	}),
}));

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
	workspaceItemReads: many(workspaceItemReads),
}));

export const workspaceItemReadsRelations = relations(workspaceItemReads, ({ one }) => ({
	thread: one(chatThreads, {
		fields: [workspaceItemReads.threadId],
		references: [chatThreads.id],
	}),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
	thread: one(chatThreads, {
		fields: [chatMessages.threadId],
		references: [chatThreads.id],
	}),
}));