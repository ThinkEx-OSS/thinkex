import { z } from "zod";
import { workspaceItemSchema } from "#/features/workspaces/contracts";

const workspacePresenceUserSchema = z.object({
	id: z.string(),
	connectionId: z.string(),
	name: z.string(),
	image: z.string().nullable(),
});

const workspacePageDeltaSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("workspace.items.upserted"),
		workspaceId: z.string(),
		revision: z.number().int().nonnegative(),
		items: z.array(workspaceItemSchema).min(1),
	}),
	z.object({
		type: z.literal("workspace.items.deleted"),
		workspaceId: z.string(),
		revision: z.number().int().nonnegative(),
		itemIds: z.array(z.string()).min(1),
	}),
]);

const workspacePageChangeSchema = z.union([
	workspacePageDeltaSchema,
	z.object({
		type: z.literal("workspace.page.refresh"),
		workspaceId: z.string(),
		revision: z.number().int().nonnegative(),
	}),
]);

const workspaceRealtimeServerMessageSchema = z.union([
	z.object({
		type: z.literal("presence.snapshot"),
		workspaceId: z.string(),
		users: z.array(workspacePresenceUserSchema),
	}),
	workspacePageChangeSchema,
]);

export type WorkspacePresenceUser = z.infer<typeof workspacePresenceUserSchema>;

export type WorkspacePageDelta = z.infer<typeof workspacePageDeltaSchema>;

export type WorkspacePageChange = z.infer<typeof workspacePageChangeSchema>;

export interface WorkspaceCommandResult<T> {
	result: T;
	revision: number;
}

export type WorkspaceRealtimeServerMessage = z.infer<typeof workspaceRealtimeServerMessageSchema>;

export function parseWorkspaceRealtimeServerMessage(value: unknown) {
	const parsed = workspaceRealtimeServerMessageSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export interface WorkspaceConnectionState {
	user: Omit<WorkspacePresenceUser, "connectionId">;
}
