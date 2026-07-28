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
	locations: readonly WorkspaceLocation[],
	options: { readonly createCandidate?: () => string } = {},
): WorkspaceReferenceRecord[] {
	const createCandidate =
		options.createCandidate ?? (() => `wr_${createRandomWorkspaceReferenceSuffix()}`);
	const locationKeys = new Set<string>();
	const refs = new Set<WorkspaceReference>();
	const records: WorkspaceReferenceRecord[] = [];

	for (const location of locations) {
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
		records.push({ location, ref: allocatedRef });
	}

	return records;
}
