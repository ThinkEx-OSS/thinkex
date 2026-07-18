import { z } from "zod";
import {
	workspaceItemFactsSchema,
	workspaceItemSummarySchema,
} from "#/features/workspaces/contracts";

const workspacePresenceUserSchema = z.object({
	id: z.string(),
	connectionId: z.string(),
	name: z.string(),
	image: z.string().nullable(),
});

const workspaceRealtimeEventBase = {
	id: z.string(),
	revision: z.number().int().nonnegative(),
	workspaceId: z.string(),
	createdAt: z.string(),
	actorUserId: z.string().nullable(),
	clientMutationId: z.string().nullable(),
};

const workspaceRealtimeEventSchema = z.discriminatedUnion("type", [
	z.object({
		...workspaceRealtimeEventBase,
		type: z.literal("workspace.item.created"),
		payload: z.object({
			item: workspaceItemSummarySchema,
			itemFacts: z.array(workspaceItemFactsSchema),
		}),
	}),
	z.object({
		...workspaceRealtimeEventBase,
		type: z.enum([
			"workspace.item.renamed",
			"workspace.item.moved",
			"workspace.item.color.updated",
			"workspace.item.content.updated",
		]),
		payload: z.object({ item: workspaceItemSummarySchema }),
	}),
	z.object({
		...workspaceRealtimeEventBase,
		type: z.literal("workspace.items.moved"),
		payload: z.object({ items: z.array(workspaceItemSummarySchema) }),
	}),
	z.object({
		...workspaceRealtimeEventBase,
		type: z.literal("workspace.item.deleted"),
		payload: z.object({
			itemIds: z.array(z.string()),
			deletedItemIds: z.array(z.string()),
			itemFacts: z.array(workspaceItemFactsSchema),
		}),
	}),
	z.object({
		...workspaceRealtimeEventBase,
		type: z.enum(["workspace.relations.updated", "workspace.item.projection.updated"]),
		payload: z.object({ itemFacts: z.array(workspaceItemFactsSchema) }),
	}),
]);

const workspaceRealtimeServerMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("presence.snapshot"),
		workspaceId: z.string(),
		users: z.array(workspacePresenceUserSchema),
	}),
	z.object({
		type: z.literal("workspace.event"),
		workspaceId: z.string(),
		event: workspaceRealtimeEventSchema,
	}),
]);

export type WorkspacePresenceUser = z.infer<typeof workspacePresenceUserSchema>;
export type WorkspaceRealtimeEvent = z.infer<typeof workspaceRealtimeEventSchema>;

export interface WorkspaceCommandResult<T> {
	result: T;
	event: WorkspaceRealtimeEvent;
}

export type WorkspaceRealtimeServerMessage = z.infer<typeof workspaceRealtimeServerMessageSchema>;

export function parseWorkspaceRealtimeServerMessage(value: unknown) {
	const parsed = workspaceRealtimeServerMessageSchema.safeParse(value);
	return parsed.success ? parsed.data : null;
}

export interface WorkspaceConnectionState {
	user: Omit<WorkspacePresenceUser, "connectionId">;
}
