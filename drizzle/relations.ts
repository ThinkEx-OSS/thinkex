import { relations } from "drizzle-orm/relations";
import { chatThreads, chatMessages, user, workspaces, workspaceShareLinks, workspaceCollaborators, account, session, workspaceEvents, workspaceSnapshots, workspaceInvites, workspaceItems } from "./schema";

export const chatMessagesRelations = relations(chatMessages, ({one}) => ({
	chatThread: one(chatThreads, {
		fields: [chatMessages.threadId],
		references: [chatThreads.id]
	}),
}));

export const chatThreadsRelations = relations(chatThreads, ({one, many}) => ({
	chatMessages: many(chatMessages),
	user: one(user, {
		fields: [chatThreads.userId],
		references: [user.id]
	}),
	workspace: one(workspaces, {
		fields: [chatThreads.workspaceId],
		references: [workspaces.id]
	}),
}));

export const userRelations = relations(user, ({many}) => ({
	chatThreads: many(chatThreads),
	accounts: many(account),
	sessions: many(session),
}));

export const workspacesRelations = relations(workspaces, ({many}) => ({
	chatThreads: many(chatThreads),
	workspaceShareLinks: many(workspaceShareLinks),
	workspaceCollaborators: many(workspaceCollaborators),
	workspaceEvents: many(workspaceEvents),
	workspaceSnapshots: many(workspaceSnapshots),
	workspaceInvites: many(workspaceInvites),
	workspaceItems: many(workspaceItems),
}));

export const workspaceShareLinksRelations = relations(workspaceShareLinks, ({one}) => ({
	workspace: one(workspaces, {
		fields: [workspaceShareLinks.workspaceId],
		references: [workspaces.id]
	}),
}));

export const workspaceCollaboratorsRelations = relations(workspaceCollaborators, ({one}) => ({
	workspace: one(workspaces, {
		fields: [workspaceCollaborators.workspaceId],
		references: [workspaces.id]
	}),
}));

export const accountRelations = relations(account, ({one}) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id]
	}),
}));

export const sessionRelations = relations(session, ({one}) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	}),
}));

export const workspaceEventsRelations = relations(workspaceEvents, ({one}) => ({
	workspace: one(workspaces, {
		fields: [workspaceEvents.workspaceId],
		references: [workspaces.id]
	}),
}));

export const workspaceSnapshotsRelations = relations(workspaceSnapshots, ({one}) => ({
	workspace: one(workspaces, {
		fields: [workspaceSnapshots.workspaceId],
		references: [workspaces.id]
	}),
}));

export const workspaceInvitesRelations = relations(workspaceInvites, ({one}) => ({
	workspace: one(workspaces, {
		fields: [workspaceInvites.workspaceId],
		references: [workspaces.id]
	}),
}));

export const workspaceItemsRelations = relations(workspaceItems, ({one}) => ({
	workspace: one(workspaces, {
		fields: [workspaceItems.workspaceId],
		references: [workspaces.id]
	}),
}));