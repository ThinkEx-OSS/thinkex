import type { JSONValue } from "ai";

import {
	createWorkspaceReferenceRecords,
	getWorkspaceLocationKey,
	type WorkspaceLocation,
	type WorkspaceReference,
	type WorkspaceReferenceRecord,
} from "#/features/workspaces/locations/workspace-location";
import {
	workspaceReadItemsOutputSchema,
	type WorkspaceContentReadResult,
	type WorkspaceReadItemsOutput,
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
 * Projects a rich workspace read result into compact model-visible JSON.
 *
 * Raw item IDs and durable locations remain in the persisted tool result.
 * Model-visible content receives only opaque refs next to the content they
 * identify.
 *
 * @param output - Validated rich workspace read output.
 * @returns JSON-safe results annotated with short workspace refs.
 */
export function createWorkspaceReadItemsModelOutput(output: WorkspaceReadItemsOutput) {
	const refsByLocation = new Map(
		output.references.map((record) => [getWorkspaceLocationKey(record.location), record.ref]),
	);

	return {
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

/**
 * Builds the model-visible projection for a persisted workspace read result,
 * tolerating outputs the agents SDK has structurally truncated.
 *
 * `toModelOutput` runs inside convertToModelMessages against persisted tool
 * results, so it re-validates the output on every replay of a thread. Truncation
 * replaces reference records with `__truncated` markers that no longer satisfy
 * the strict schema, so a throwing parse here would wedge the thread on every
 * subsequent turn. When validation fails, the raw truncated output is passed
 * straight through instead — matching how the rest of this feature degrades on
 * unparseable records rather than throwing.
 *
 * @param output - Persisted workspace read output, possibly truncated.
 * @returns The ref-annotated projection, or the raw output when unparseable.
 */
export function projectWorkspaceReadItemsModelOutput(output: unknown): JSONValue {
	const parsed = workspaceReadItemsOutputSchema.safeParse(output);

	return parsed.success ? createWorkspaceReadItemsModelOutput(parsed.data) : (output as JSONValue);
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
