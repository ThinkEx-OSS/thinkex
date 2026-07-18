import { z } from "zod";

const workspaceContentCursorSchema = z.discriminatedUnion("kind", [
	z.object({
		itemId: z.string().min(1),
		kind: z.literal("document"),
		offset: z.number().int().nonnegative(),
		revision: z.string().min(1),
		version: z.literal(1),
	}),
	z.object({
		itemId: z.string().min(1),
		kind: z.literal("file"),
		nextPage: z.number().int().positive(),
		sourceHash: z.string().min(1),
		version: z.literal(1),
	}),
]);

export type WorkspaceContentCursor = z.infer<typeof workspaceContentCursorSchema>;

export function encodeWorkspaceContentCursor(cursor: WorkspaceContentCursor) {
	return btoa(JSON.stringify(cursor)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeWorkspaceContentCursor(value: string): WorkspaceContentCursor | null {
	if (value.length > 4_096) {
		return null;
	}
	try {
		const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
		const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
		return workspaceContentCursorSchema.parse(JSON.parse(atob(padded)));
	} catch {
		return null;
	}
}
