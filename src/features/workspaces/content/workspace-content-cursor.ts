import { z } from "zod";

import { decodeBase64UrlText, encodeBase64UrlText } from "#/lib/binary";

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

type WorkspaceContentCursor = z.infer<typeof workspaceContentCursorSchema>;

export function encodeWorkspaceContentCursor(cursor: WorkspaceContentCursor) {
	return encodeBase64UrlText(JSON.stringify(cursor));
}

export function decodeWorkspaceContentCursor(value: string): WorkspaceContentCursor | null {
	if (value.length > 4_096) {
		return null;
	}
	try {
		return workspaceContentCursorSchema.parse(JSON.parse(decodeBase64UrlText(value)));
	} catch {
		return null;
	}
}
