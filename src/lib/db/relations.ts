import { relations } from "drizzle-orm/relations";
import { workspaces, workspaceSnapshots, workspaceEvents } from "./schema";

// workspace_shares removed - sharing is now fork-based (users import copies)

export const workspacesRelations = relations(workspaces, ({ many }) => ({
	workspaceSnapshots: many(workspaceSnapshots),
	workspaceEvents: many(workspaceEvents),
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