import { customAlphabet } from "nanoid";
import { z } from "zod";

import {
	getWorkspaceLocationKey,
	type WorkspaceLocation,
	workspaceLocationSchema,
} from "#/features/workspaces/locations/workspace-location";

const WORKSPACE_REFERENCE_ALPHABET =
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const WORKSPACE_REFERENCE_RANDOM_LENGTH = 8;
const WORKSPACE_REFERENCE_COLLISION_ATTEMPTS = 32;
const createRandomWorkspaceReferenceSuffix = customAlphabet(
	WORKSPACE_REFERENCE_ALPHABET,
	WORKSPACE_REFERENCE_RANDOM_LENGTH,
);

/** Schema for the exact short reference the model is allowed to copy. */
export const workspaceReferenceSchema = z
	.string()
	.regex(/^wr_[0-9A-Za-z]{8}$/)
	.brand<"WorkspaceReference">();

/** Short model-facing alias for a durable workspace location. */
export type WorkspaceReference = z.output<typeof workspaceReferenceSchema>;

/** Schema for a durable location retained behind a short reference. */
export const workspaceReferenceRecordSchema = z.strictObject({
	location: workspaceLocationSchema,
	ref: workspaceReferenceSchema,
});

/** Durable record retained behind a short workspace reference. */
export type WorkspaceReferenceRecord = Readonly<z.output<typeof workspaceReferenceRecordSchema>>;

/** Result of parsing an untrusted workspace reference. */
export type WorkspaceReferenceParseResult =
	| { readonly status: "invalid" }
	| { readonly ref: WorkspaceReference; readonly status: "parsed" };

/** In-memory allocator used while assembling model-visible workspace content. */
export type WorkspaceReferenceRegistry = {
	/**
	 * Returns the existing ref for a location or allocates a collision-free one.
	 *
	 * @param location - Durable location being exposed to the model.
	 * @returns The stable ref for this registry lifetime.
	 */
	getOrCreate(location: WorkspaceLocation): WorkspaceReference;

	/**
	 * Returns all allocated records in insertion order.
	 *
	 * @returns Immutable reference records suitable for persistence.
	 */
	records(): readonly WorkspaceReferenceRecord[];
};

/**
 * Parses an untrusted short workspace reference.
 *
 * @param input - Untrusted model or persisted value.
 * @returns A branded reference, or an explicit invalid result.
 */
export function parseWorkspaceReference(input: unknown): WorkspaceReferenceParseResult {
	const parsed = workspaceReferenceSchema.safeParse(input);

	return parsed.success ? { ref: parsed.data, status: "parsed" } : { status: "invalid" };
}

/**
 * Creates a location-aware, collision-checking workspace-reference registry.
 *
 * The optional candidate source is an internal test seam. Production callers
 * should use the default cryptographically strong Nano ID source.
 *
 * @param options - Optional candidate source for deterministic verification.
 * @returns A registry that reuses refs for identical durable locations.
 */
export function createWorkspaceReferenceRegistry(
	options: { readonly createCandidate?: () => string } = {},
): WorkspaceReferenceRegistry {
	const createCandidate =
		options.createCandidate ?? (() => `wr_${createRandomWorkspaceReferenceSuffix()}`);
	const locationsByRef = new Map<WorkspaceReference, WorkspaceLocation>();
	const refsByLocation = new Map<string, WorkspaceReference>();

	return {
		getOrCreate(location) {
			const locationKey = getWorkspaceLocationKey(location);
			const existing = refsByLocation.get(locationKey);
			if (existing) {
				return existing;
			}

			for (let attempt = 0; attempt < WORKSPACE_REFERENCE_COLLISION_ATTEMPTS; attempt += 1) {
				const parsed = parseWorkspaceReference(createCandidate());
				if (parsed.status === "invalid") {
					throw new Error("Workspace reference candidate source returned an invalid value.");
				}
				if (locationsByRef.has(parsed.ref)) {
					continue;
				}

				locationsByRef.set(parsed.ref, location);
				refsByLocation.set(locationKey, parsed.ref);
				return parsed.ref;
			}

			throw new Error("Unable to allocate a collision-free workspace reference.");
		},
		records() {
			return Array.from(locationsByRef, ([ref, location]) => ({ location, ref }));
		},
	};
}
