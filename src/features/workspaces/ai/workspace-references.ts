import { isToolUIPart, type UIMessage } from "ai";
import { z } from "zod";

import { getWorkspaceToolResultAdapter } from "#/features/workspaces/ai/workspace-tool-result-adapters";
import {
	getWorkspaceLocationKey,
	indexWorkspaceReferenceRecords,
	parseWorkspaceReference,
	type WorkspaceReference,
	type WorkspaceReferenceRecord,
	type WorkspaceLocation,
	workspaceReferenceRecordSchema,
} from "#/features/workspaces/locations/workspace-location";

export const WORKSPACE_REFERENCES_DATA_PART_TYPE = "data-workspace-references";
const MAX_WORKSPACE_CITATIONS_PER_MESSAGE = 50;
const workspaceCitationTagPattern =
	/<citation\s+ref=(["'])([^"']+)\1\s*(?:\/>|>\s*<\/citation\s*>)/g;
const anyCompleteWorkspaceCitationTagPattern = /<\/?citation\b[^>]*>/gi;

const workspaceReferencesDataSchema = z.strictObject({
	references: z.array(workspaceReferenceRecordSchema),
	version: z.literal(1),
});

/**
 * Reconciles one hidden reference data part onto an assistant message.
 *
 * It retains valid cited refs plus refs produced inside Code Mode that do not
 * already live in a direct tool result. Unknown or colliding citations stay inert.
 *
 * @param message - Finalized assistant message.
 * @param candidates - App-issued refs available to this response.
 * @returns The original message when already normalized, otherwise an updated copy.
 */
export function reconcileWorkspaceMessageReferences(
	message: UIMessage,
	candidates: readonly WorkspaceReferenceRecord[],
	retain: readonly WorkspaceReferenceRecord[] = [],
): UIMessage {
	const directRecords = collectWorkspaceToolReferenceRecords(message);
	const directKeys = new Set(directRecords.map(getWorkspaceReferenceRecordKey));
	const references = dedupeWorkspaceReferenceRecords([
		...resolveUsedWorkspaceCitations(message, candidates),
		...retain.filter((record) => !directKeys.has(getWorkspaceReferenceRecordKey(record))),
	]);

	if (hasCanonicalWorkspaceReferencePart(message, references)) {
		return message;
	}

	const parts = message.parts.filter((part) => part.type !== WORKSPACE_REFERENCES_DATA_PART_TYPE);
	if (references.length > 0) {
		parts.push({
			type: WORKSPACE_REFERENCES_DATA_PART_TYPE,
			data: {
				references,
				version: 1,
			},
		});
	}

	return { ...message, parts };
}

/**
 * Returns validated durable reference records persisted on a UI message.
 *
 * @param message - Any persisted or streaming UI message.
 * @returns The first valid normalized reference list, or an empty list.
 */
function getWorkspaceMessageReferenceRecords(
	message: UIMessage,
): readonly WorkspaceReferenceRecord[] {
	for (const part of message.parts) {
		if (part.type !== WORKSPACE_REFERENCES_DATA_PART_TYPE || !("data" in part)) {
			continue;
		}

		const parsed = workspaceReferencesDataSchema.safeParse(part.data);
		if (parsed.success) {
			return parsed.data.references;
		}
	}

	return [];
}

/**
 * Collects app-issued reference records from direct workspace tools and
 * normalized hidden reference data in a persisted transcript.
 *
 * Code Mode's final result is model-authored, so genuine nested reads are
 * captured during execution instead of trusted from the orchestration output.
 *
 * @param messages - UI messages on the active thread path.
 * @returns Candidate records in transcript order.
 */
export function collectWorkspaceReferenceRecords(
	messages: readonly UIMessage[],
): WorkspaceReferenceRecord[] {
	const records: WorkspaceReferenceRecord[] = [];

	for (const message of messages) {
		if (message.role !== "assistant") {
			continue;
		}

		records.push(...getWorkspaceMessageReferenceRecords(message));
		records.push(...collectWorkspaceToolReferenceRecords(message));
	}

	return records;
}

/**
 * Builds the unambiguous ref-to-location map available while rendering a message.
 *
 * Persisted references and completed direct workspace-tool outputs both
 * contribute, so direct tool citations can appear before post-response
 * reconciliation arrives.
 *
 * @param message - Streaming or persisted UI message.
 * @returns Unambiguous locations keyed by their exact model-facing refs.
 */
export function getWorkspaceCitationLocations(
	message: UIMessage,
): ReadonlyMap<WorkspaceReference, WorkspaceLocation> {
	const index = indexWorkspaceReferenceRecords(collectWorkspaceReferenceRecords([message]));
	const locations = new Map<WorkspaceReference, WorkspaceLocation>();

	for (const [ref, record] of index) {
		if (record) locations.set(ref, record.location);
	}

	return locations;
}

/**
 * Removes model-only citation markers from text copied to the clipboard.
 *
 * @param text - Assistant Markdown containing zero or more citation tags.
 * @returns Markdown without citation protocol markup.
 */
export function stripWorkspaceCitationTags(text: string) {
	return text.replace(anyCompleteWorkspaceCitationTagPattern, "");
}

function resolveUsedWorkspaceCitations(
	message: UIMessage,
	candidates: readonly WorkspaceReferenceRecord[],
) {
	const candidateIndex = indexWorkspaceReferenceRecords(candidates);
	const citations: WorkspaceReferenceRecord[] = [];
	const usedRefs = new Set<WorkspaceReference>();

	for (const part of message.parts) {
		if (part.type !== "text") {
			continue;
		}

		for (const match of part.text.matchAll(workspaceCitationTagPattern)) {
			const ref = parseWorkspaceReference(match[2]);
			if (!ref || usedRefs.has(ref)) {
				continue;
			}

			const candidate = candidateIndex.get(ref);
			if (!candidate) {
				continue;
			}

			usedRefs.add(ref);
			citations.push(candidate);
			if (citations.length === MAX_WORKSPACE_CITATIONS_PER_MESSAGE) {
				return citations;
			}
		}
	}

	return citations;
}

function haveSameWorkspaceReferences(
	left: readonly WorkspaceReferenceRecord[],
	right: readonly WorkspaceReferenceRecord[],
) {
	return (
		left.length === right.length &&
		left.every(
			(record, index) =>
				record.ref === right[index]?.ref &&
				getWorkspaceLocationKey(record.location) ===
					getWorkspaceLocationKey(right[index].location) &&
				record.revision === right[index].revision,
		)
	);
}

function hasCanonicalWorkspaceReferencePart(
	message: UIMessage,
	references: readonly WorkspaceReferenceRecord[],
) {
	const referenceParts = message.parts.filter(
		(part) => part.type === WORKSPACE_REFERENCES_DATA_PART_TYPE,
	);

	if (references.length === 0) {
		return referenceParts.length === 0;
	}

	if (referenceParts.length !== 1) {
		return false;
	}

	const [part] = referenceParts;
	if (!part || !("data" in part)) {
		return false;
	}

	const parsed = workspaceReferencesDataSchema.safeParse(part.data);
	return parsed.success && haveSameWorkspaceReferences(parsed.data.references, references);
}

function collectWorkspaceToolReferenceRecords(message: UIMessage) {
	const records: WorkspaceReferenceRecord[] = [];
	for (const part of message.parts) {
		if (!isToolUIPart(part) || part.state !== "output-available") continue;
		const toolName =
			part.type === "dynamic-tool" ? part.toolName : part.type.split("-").slice(1).join("-");
		records.push(
			...(getWorkspaceToolResultAdapter(toolName)?.collectReferences(part.output) ?? []),
		);
	}
	return records;
}

function dedupeWorkspaceReferenceRecords(records: readonly WorkspaceReferenceRecord[]) {
	const seen = new Set<string>();
	return records.filter((record) => {
		const key = getWorkspaceReferenceRecordKey(record);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function getWorkspaceReferenceRecordKey(record: WorkspaceReferenceRecord) {
	return `${record.ref}:${getWorkspaceLocationKey(record.location)}:${record.revision ?? ""}`;
}
