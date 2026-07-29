import {
	createWorkspaceReferenceRecords,
	getWorkspaceLocationKey,
	type WorkspaceLocation,
	type WorkspaceReference,
	type WorkspaceReferenceRecord,
} from "#/features/workspaces/locations/workspace-location";
import type {
	WorkspaceContentReadResult,
	WorkspaceReadItemsOutput,
} from "#/features/workspaces/content/workspace-content-contract";

/**
 * Allocates durable-location records for every ready workspace read.
 *
 * Documents and images receive one item-level ref. PDFs receive one ref per
 * physical page so the model never has to cite an imprecise page range.
 *
 * @param results - Ordered workspace read results.
 * @returns Deduplicated reference records for the rich tool result.
 */
export function createWorkspaceReadReferences(
	results: readonly WorkspaceContentReadResult[],
): WorkspaceReferenceRecord[] {
	const locations: WorkspaceLocation[] = [];

	for (const result of results) {
		if (result.status !== "ready") {
			continue;
		}

		if (result.type === "document" || result.assetKind !== "pdf") {
			locations.push({
				itemId: result.itemId,
				kind: "item",
				version: 1,
			});
			continue;
		}

		for (const pageNumber of result.location.returned) {
			locations.push({
				itemId: result.itemId,
				kind: "pdf-page",
				pageNumber,
				version: 1,
			});
		}
	}

	return createWorkspaceReferenceRecords(locations);
}

/**
 * Guidance for read outcomes the model has to react to, keyed by situation.
 *
 * These live here rather than in the tool description because none of them
 * change how a read is issued, and background extraction states are rare enough
 * that every request should not carry the instructions for handling them.
 */
const workspaceReadGuidance = {
	pending:
		"Some paths are still extracting. Never sleep, poll, or otherwise stall waiting for them, including inside compute, sandbox_bash, or orchestrate. Either do other work and read those paths again later in this reply, or tell the user they are still processing and to ask again in about retryAfterSeconds. Never read the same pending path more than twice in one reply.",
	unrecoverable:
		"Extraction will not finish for some paths. Report the code and any message to the user; do not retry those reads and do not suggest re-uploading the file.",
	transient:
		"Some paths failed on a transient storage problem. One repeat read is reasonable; if it fails again, tell the user.",
	provisional:
		"Some content came from a fast first pass. Pages listed in emptyPages are still extracting, so read them again later rather than reporting them as blank.",
} as const;

/**
 * Collects the handling guidance a set of read results calls for.
 *
 * Emitted once per situation rather than once per result so a batch of pending
 * reads does not repeat the same paragraph for every path.
 *
 * @param results - Ordered workspace read results.
 * @returns Guidance lines for the situations present, most actionable first.
 */
function createWorkspaceReadGuidance(results: readonly WorkspaceContentReadResult[]): string[] {
	const situations = new Set<keyof typeof workspaceReadGuidance>();

	for (const result of results) {
		if (result.status === "pending") {
			situations.add("pending");
			continue;
		}

		if (result.status === "failed") {
			if (result.code === "extraction_failed" || result.code === "extraction_stalled") {
				situations.add("unrecoverable");
			} else if (result.code === "projection_failed") {
				situations.add("transient");
			}
			continue;
		}

		// Gate on provisional only: emptyPages on a final (non-provisional) read
		// describes genuinely blank pages, which must not be reported as still
		// extracting or the model retries a completed read forever.
		if (result.type === "file" && result.provisional) {
			situations.add("provisional");
		}
	}

	return (Object.keys(workspaceReadGuidance) as Array<keyof typeof workspaceReadGuidance>)
		.filter((situation) => situations.has(situation))
		.map((situation) => workspaceReadGuidance[situation]);
}

/**
 * Projects a rich workspace read result into compact model-visible JSON.
 *
 * Raw item IDs and durable locations remain in the persisted tool result.
 * Model-visible content receives only opaque refs next to the content they
 * identify, plus guidance for any outcome that needs handling.
 *
 * @param output - Validated rich workspace read output.
 * @returns JSON-safe results annotated with short workspace refs.
 */
export function createWorkspaceReadItemsModelOutput(output: WorkspaceReadItemsOutput) {
	const refsByLocation = new Map(
		output.references.map((record) => [getWorkspaceLocationKey(record.location), record.ref]),
	);
	const guidance = createWorkspaceReadGuidance(output.results);

	return {
		...(guidance.length > 0 ? { guidance } : {}),
		results: output.results.map((result) => {
			if (result.status !== "ready") {
				return result;
			}

			if (result.type === "document" || result.assetKind !== "pdf") {
				const ref = refsByLocation.get(
					getWorkspaceLocationKey({
						itemId: result.itemId,
						kind: "item",
						version: 1,
					}),
				);

				return {
					...omitWorkspaceReadItemId(result),
					...(ref ? { reference: ref } : {}),
				};
			}

			const references = result.location.returned.flatMap((pageNumber) => {
				const ref = refsByLocation.get(
					getWorkspaceLocationKey({
						itemId: result.itemId,
						kind: "pdf-page",
						pageNumber,
						version: 1,
					}),
				);

				return ref ? [{ pageNumber, ref }] : [];
			});

			return {
				...omitWorkspaceReadItemId(result),
				content: annotateWorkspaceReadPageHeadings(result.content, references),
			};
		}),
	};
}

function omitWorkspaceReadItemId<T extends { readonly itemId: string }>(
	result: T,
): Omit<T, "itemId"> {
	const { itemId: _itemId, ...modelResult } = result;

	return modelResult;
}

function annotateWorkspaceReadPageHeadings(
	content: string,
	references: readonly { readonly pageNumber: number; readonly ref: WorkspaceReference }[],
) {
	const refsByPage = new Map(references.map(({ pageNumber, ref }) => [pageNumber, ref]));

	return content.replace(/^## Page (\d+)[ \t]*$/gm, (heading, pageNumberText: string) => {
		const pageNumber = Number(pageNumberText);
		const ref = refsByPage.get(pageNumber);
		if (!ref) {
			return heading;
		}

		return `${heading} [ref: ${ref}]`;
	});
}
