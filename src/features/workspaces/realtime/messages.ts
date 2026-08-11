import { z } from "zod";

const workspacePresenceUserSchema = z.object({
	id: z.string(),
	connectionId: z.string(),
	name: z.string(),
	image: z.string().nullable(),
});

const workspaceRealtimeServerMessageSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("presence.snapshot"),
		workspaceId: z.string(),
		users: z.array(workspacePresenceUserSchema),
	}),
	z.object({
		type: z.literal("workspace.changed"),
		workspaceId: z.string(),
		revision: z.number().int().nonnegative(),
	}),
]);

export type WorkspacePresenceUser = z.infer<typeof workspacePresenceUserSchema>;

export interface WorkspaceRevision {
	workspaceId: string;
	revision: number;
}

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
