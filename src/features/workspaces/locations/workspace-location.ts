import { customAlphabet } from "nanoid";
import { z } from "zod";

const WORKSPACE_REFERENCE_ALPHABET =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const WORKSPACE_REFERENCE_RANDOM_LENGTH = 8;
const WORKSPACE_REFERENCE_COLLISION_ATTEMPTS = 32;
const createRandomWorkspaceReferenceSuffix = customAlphabet(
	WORKSPACE_REFERENCE_ALPHABET,
	WORKSPACE_REFERENCE_RANDOM_LENGTH,
);
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
	z.strictObject({
		itemId: workspaceLocationItemIdSchema,
		kind: z.literal("document-block"),
		blockId: z.string().regex(/^b_[A-Za-z0-9_-]{12}$/),
		version: z.literal(1),
	}),
	z.strictObject({
		itemId: workspaceLocationItemIdSchema,
		kind: z.literal("flashcard"),
		cardId: z.uuid(),
		version: z.literal(1),
	}),
]);

/** A parsed durable workspace location. */
export type WorkspaceLocation = Readonly<z.output<typeof workspaceLocationSchema>>;

/** Schema for the exact short reference the model is allowed to copy. */
export const workspaceReferenceInputSchema = z.string().regex(/^wr_[0-9A-Za-z]{8}$/);
export const workspaceReferenceSchema = workspaceReferenceInputSchema.brand<"WorkspaceReference">();

/** Short model-facing alias for a durable workspace location. */
export type WorkspaceReference = z.output<typeof workspaceReferenceSchema>;

/** Schema for a durable location retained behind a short reference. */
export const workspaceReferenceRecordSchema = z.strictObject({
	location: workspaceLocationSchema,
	ref: workspaceReferenceSchema,
	revision: z
		.string()
		.regex(/^[A-Za-z0-9_-]{10}$/)
		.optional(),
});

/** Durable record retained behind a short workspace reference. */
export type WorkspaceReferenceRecord = Readonly<z.output<typeof workspaceReferenceRecordSchema>>;

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
		case "document-block":
			return `1:document-block:${location.itemId}:${location.blockId}`;
		case "flashcard":
			return `1:flashcard:${location.itemId}:${location.cardId}`;
	}
}

/**
 * Parses an untrusted short workspace reference.
 *
 * @param input - Untrusted model or persisted value.
 * @returns A branded reference when valid.
 */
export function parseWorkspaceReference(input: unknown) {
	const parsed = workspaceReferenceSchema.safeParse(input);

	return parsed.success ? parsed.data : undefined;
}

/** Index app-issued refs while making collisions unusable. */
export function indexWorkspaceReferenceRecords(
	records: readonly WorkspaceReferenceRecord[],
): ReadonlyMap<WorkspaceReference, WorkspaceReferenceRecord | null> {
	const index = new Map<WorkspaceReference, WorkspaceReferenceRecord | null>();
	for (const record of records) {
		const existing = index.get(record.ref);
		if (existing === undefined) {
			index.set(record.ref, record);
		} else if (
			existing &&
			(getWorkspaceLocationKey(existing.location) !== getWorkspaceLocationKey(record.location) ||
				existing.revision !== record.revision)
		) {
			index.set(record.ref, null);
		}
	}
	return index;
}

/**
 * Creates deduplicated, collision-checked refs for durable locations.
 *
 * The optional candidate source is an internal test seam. Production callers
 * should use the default cryptographically strong Nano ID source.
 *
 * @param locations - Durable locations in desired record order.
 * @param options - Optional candidate source for deterministic verification.
 * @returns One reference record per distinct location.
 */
export function createWorkspaceReferenceRecords(
	targets: readonly (WorkspaceLocation | { location: WorkspaceLocation; revision: string })[],
	options: { readonly createCandidate?: () => string } = {},
): WorkspaceReferenceRecord[] {
	const createCandidate =
		options.createCandidate ?? (() => `wr_${createRandomWorkspaceReferenceSuffix()}`);
	const locationKeys = new Set<string>();
	const refs = new Set<WorkspaceReference>();
	const records: WorkspaceReferenceRecord[] = [];

	for (const target of targets) {
		const { location, revision } =
			"location" in target ? target : { location: target, revision: undefined };
		const locationKey = getWorkspaceLocationKey(location);
		if (locationKeys.has(locationKey)) {
			continue;
		}

		let allocatedRef: WorkspaceReference | undefined;
		for (let attempt = 0; attempt < WORKSPACE_REFERENCE_COLLISION_ATTEMPTS; attempt += 1) {
			const ref = parseWorkspaceReference(createCandidate());
			if (!ref) {
				throw new Error("Workspace reference candidate source returned an invalid value.");
			}
			if (refs.has(ref)) {
				continue;
			}

			allocatedRef = ref;
			break;
		}

		if (!allocatedRef) {
			throw new Error("Unable to allocate a collision-free workspace reference.");
		}

		locationKeys.add(locationKey);
		refs.add(allocatedRef);
		records.push({ location, ref: allocatedRef, ...(revision ? { revision } : {}) });
	}

	return records;
}
