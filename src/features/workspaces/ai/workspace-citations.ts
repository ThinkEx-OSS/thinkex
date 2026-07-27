import { isToolUIPart, type UIMessage } from "ai";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import { z } from "zod";

import {
	type WorkspaceReference,
	type WorkspaceReferenceRecord,
	workspaceReferenceRecordSchema,
} from "#/features/workspaces/ai/workspace-reference";
import { workspaceReadItemsOutputSchema } from "#/features/workspaces/content/workspace-content-contract";
import {
	getWorkspaceLocationKey,
	type WorkspaceLocation,
} from "#/features/workspaces/locations/workspace-location";

export const WORKSPACE_CITATIONS_DATA_PART_TYPE = "data-workspace-citations";
const WORKSPACE_CITATIONS_DATA_PART_ID = "workspace-citations";
const MAX_WORKSPACE_CITATIONS_PER_MESSAGE = 50;
const workspaceCitationTagPattern =
	/<citation\s+ref=(["'])(wr_[0-9A-Za-z]{8})\1\s*(?:\/>|>\s*<\/citation\s*>)/g;
const anyCompleteWorkspaceCitationTagPattern = /<\/?citation\b[^>]*>/gi;
const workspaceCitationMarkdownParser = unified().use(remarkParse).use(remarkGfm);

export const workspaceCitationsDataSchema = z.strictObject({
	citations: z.array(workspaceReferenceRecordSchema).max(MAX_WORKSPACE_CITATIONS_PER_MESSAGE),
	version: z.literal(1),
});

/**
 * Reconciles one normalized citation data part onto an assistant message.
 *
 * Only exact refs present in the assistant text and mapped unambiguously by an
 * app-issued candidate survive. Unknown or colliding refs remain inert.
 *
 * @param message - Finalized assistant message.
 * @param candidates - App-issued refs available to this response.
 * @returns The original message when already normalized, otherwise an updated copy.
 */
export function reconcileWorkspaceMessageCitations(
	message: UIMessage,
	candidates: readonly WorkspaceReferenceRecord[],
): UIMessage {
	const citations = resolveUsedWorkspaceCitations(message, candidates);

	if (hasCanonicalWorkspaceCitationPart(message, citations)) {
		return message;
	}

	const parts = message.parts.filter((part) => part.type !== WORKSPACE_CITATIONS_DATA_PART_TYPE);
	if (citations.length > 0) {
		parts.push({
			type: WORKSPACE_CITATIONS_DATA_PART_TYPE,
			id: WORKSPACE_CITATIONS_DATA_PART_ID,
			data: {
				citations,
				version: 1,
			},
		});
	}

	return { ...message, parts };
}

/**
 * Returns validated durable citations persisted on a UI message.
 *
 * @param message - Any persisted or streaming UI message.
 * @returns The first valid normalized citation list, or an empty list.
 */
export function getWorkspaceCitationRecords(
	message: UIMessage,
): readonly WorkspaceReferenceRecord[] {
	for (const part of message.parts) {
		if (part.type !== WORKSPACE_CITATIONS_DATA_PART_TYPE || !("data" in part)) {
			continue;
		}

		const parsed = workspaceCitationsDataSchema.safeParse(part.data);
		if (parsed.success) {
			return parsed.data.citations;
		}
	}

	return [];
}

/**
 * Collects app-issued reference records from direct workspace reads and
 * normalized citation data in a persisted transcript.
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

		records.push(...getWorkspaceCitationRecords(message));

		for (const part of message.parts) {
			if (!isToolUIPart(part) || part.state !== "output-available") {
				continue;
			}

			const toolName =
				part.type === "dynamic-tool" ? part.toolName : part.type.split("-").slice(1).join("-");

			if (toolName !== "workspace_read_items") {
				continue;
			}

			const parsed = workspaceReadItemsOutputSchema.safeParse(part.output);
			if (parsed.success) {
				records.push(...parsed.data.references);
			}
		}
	}

	return records;
}

/**
 * Builds the unambiguous ref-to-location map available while rendering a message.
 *
 * Persisted citations and completed direct workspace-read outputs both
 * contribute, so direct tool citations can appear before post-response
 * reconciliation arrives.
 *
 * @param message - Streaming or persisted UI message.
 * @returns Unambiguous locations keyed by their exact model-facing refs.
 */
export function getWorkspaceCitationLocations(
	message: UIMessage,
): ReadonlyMap<WorkspaceReference, WorkspaceLocation> {
	const index = indexWorkspaceReferenceCandidates(collectWorkspaceReferenceRecords([message]));
	const locations = new Map<WorkspaceReference, WorkspaceLocation>();

	for (const [ref, candidate] of index) {
		if (candidate.status === "resolved") {
			locations.set(ref, candidate.record.location);
		}
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
	const matches = [...text.matchAll(anyCompleteWorkspaceCitationTagPattern)];
	if (matches.length === 0) {
		return text;
	}

	const codeRanges = getMarkdownCodeRanges(text);
	let result = "";
	let sourceOffset = 0;

	for (const match of matches) {
		if (isOffsetInRanges(match.index, codeRanges)) {
			continue;
		}

		result += text.slice(sourceOffset, match.index);
		sourceOffset = match.index + match[0].length;
	}

	return result + text.slice(sourceOffset);
}

function resolveUsedWorkspaceCitations(
	message: UIMessage,
	candidates: readonly WorkspaceReferenceRecord[],
) {
	const candidateIndex = indexWorkspaceReferenceCandidates(candidates);
	const citations: WorkspaceReferenceRecord[] = [];
	const usedRefs = new Set<WorkspaceReference>();

	for (const part of message.parts) {
		if (part.type !== "text") {
			continue;
		}

		const matches = [...part.text.matchAll(workspaceCitationTagPattern)];
		if (matches.length === 0) {
			continue;
		}

		const codeRanges = getMarkdownCodeRanges(part.text);
		for (const match of matches) {
			if (isOffsetInRanges(match.index, codeRanges)) {
				continue;
			}

			const ref = match[2] as WorkspaceReference;
			if (usedRefs.has(ref)) {
				continue;
			}

			const candidate = candidateIndex.get(ref);
			if (!candidate || candidate.status === "ambiguous") {
				continue;
			}

			usedRefs.add(ref);
			citations.push(candidate.record);
			if (citations.length === MAX_WORKSPACE_CITATIONS_PER_MESSAGE) {
				return citations;
			}
		}
	}

	return citations;
}

function getMarkdownCodeRanges(text: string) {
	const ranges: Array<{ readonly end: number; readonly start: number }> = [];
	const tree = workspaceCitationMarkdownParser.parse(text);

	visit(tree, (node) => {
		if (node.type !== "code" && node.type !== "inlineCode") {
			return;
		}

		const start = node.position?.start.offset;
		const end = node.position?.end.offset;
		if (start !== undefined && end !== undefined) {
			ranges.push({ end, start });
		}
	});

	return ranges;
}

function isOffsetInRanges(
	offset: number,
	ranges: readonly { readonly end: number; readonly start: number }[],
) {
	return ranges.some((range) => offset >= range.start && offset < range.end);
}

function indexWorkspaceReferenceCandidates(candidates: readonly WorkspaceReferenceRecord[]) {
	const index = new Map<
		WorkspaceReference,
		| { readonly record: WorkspaceReferenceRecord; readonly status: "resolved" }
		| { readonly status: "ambiguous" }
	>();

	for (const record of candidates) {
		const existing = index.get(record.ref);
		if (!existing) {
			index.set(record.ref, { record, status: "resolved" });
			continue;
		}

		if (
			existing.status === "resolved" &&
			getWorkspaceLocationKey(existing.record.location) !== getWorkspaceLocationKey(record.location)
		) {
			index.set(record.ref, { status: "ambiguous" });
		}
	}

	return index;
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
				getWorkspaceLocationKey(record.location) === getWorkspaceLocationKey(right[index].location),
		)
	);
}

function hasCanonicalWorkspaceCitationPart(
	message: UIMessage,
	citations: readonly WorkspaceReferenceRecord[],
) {
	const citationParts = message.parts.filter(
		(part) => part.type === WORKSPACE_CITATIONS_DATA_PART_TYPE,
	);

	if (citations.length === 0) {
		return citationParts.length === 0;
	}

	if (citationParts.length !== 1) {
		return false;
	}

	const [part] = citationParts;
	if (!part || !("data" in part) || part.id !== WORKSPACE_CITATIONS_DATA_PART_ID) {
		return false;
	}

	const parsed = workspaceCitationsDataSchema.safeParse(part.data);
	return parsed.success && haveSameWorkspaceReferences(parsed.data.citations, citations);
}
