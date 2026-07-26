import { z } from "zod";

const workspaceLocationItemIdSchema = z.string().trim().min(1);

/**
 * Durable, versioned pointer to content inside a workspace.
 *
 * Short AI-facing references are aliases for this value and must never replace
 * it in persisted application state.
 */
export const workspaceLocationSchema = z.discriminatedUnion("kind", [
	z.strictObject({
		itemId: workspaceLocationItemIdSchema,
		kind: z.literal("item"),
		version: z.literal(1),
	}),
	z.strictObject({
		itemId: workspaceLocationItemIdSchema,
		kind: z.literal("pdf-page"),
		pageNumber: z.number().int().positive(),
		version: z.literal(1),
	}),
]);

/** A parsed durable workspace location. */
export type WorkspaceLocation = Readonly<z.output<typeof workspaceLocationSchema>>;

/** Result of parsing an untrusted workspace location. */
export type WorkspaceLocationParseResult =
	| { readonly status: "invalid" }
	| { readonly location: WorkspaceLocation; readonly status: "parsed" };

/**
 * Parses an untrusted value into a durable workspace location.
 *
 * @param input - Untrusted value from persisted or model-adjacent data.
 * @returns The parsed location, or an explicit invalid result.
 */
export function parseWorkspaceLocation(input: unknown): WorkspaceLocationParseResult {
	const parsed = workspaceLocationSchema.safeParse(input);

	return parsed.success ? { location: parsed.data, status: "parsed" } : { status: "invalid" };
}

/**
 * Produces the canonical in-memory key for a workspace location.
 *
 * @param location - Parsed workspace location.
 * @returns A collision-free key within location schema version 1.
 */
export function getWorkspaceLocationKey(location: WorkspaceLocation) {
	switch (location.kind) {
		case "item":
			return `1:item:${location.itemId}`;
		case "pdf-page":
			return `1:pdf-page:${location.itemId}:${location.pageNumber}`;
	}
}
