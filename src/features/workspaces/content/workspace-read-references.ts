import {
	createWorkspaceReferenceRecords,
	type WorkspaceReference,
	type WorkspaceReferenceRecord,
} from "#/features/workspaces/ai/workspace-reference";
import type {
	WorkspaceContentReadResult,
	WorkspaceReadItemsOutput,
} from "#/features/workspaces/content/workspace-content-contract";
import {
	getWorkspaceLocationKey,
	type WorkspaceLocation,
} from "#/features/workspaces/locations/workspace-location";

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
