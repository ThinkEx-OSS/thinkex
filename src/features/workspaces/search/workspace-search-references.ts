import {
	createWorkspaceReferenceRecords,
	getWorkspaceLocationKey,
	type WorkspaceLocation,
} from "#/features/workspaces/locations/workspace-location";
import type {
	WorkspaceSearchOutput,
	WorkspaceSearchResult,
} from "#/features/workspaces/search/workspace-search-contract";

export function createWorkspaceSearchReferences(results: readonly WorkspaceSearchResult[]) {
	return createWorkspaceReferenceRecords(results.map(getSearchResultLocation));
}

export function createWorkspaceSearchModelOutput(output: WorkspaceSearchOutput) {
	const refsByLocation = new Map(
		output.references.map((record) => [getWorkspaceLocationKey(record.location), record.ref]),
	);

	return {
		failed: output.failed,
		results: output.results.map((result) => {
			const { itemId: _itemId, ...modelResult } = result;
			const reference = refsByLocation.get(
				getWorkspaceLocationKey(getSearchResultLocation(result)),
			);

			return {
				...modelResult,
				...(reference ? { reference } : {}),
			};
		}),
	};
}

function getSearchResultLocation(result: WorkspaceSearchResult): WorkspaceLocation {
	if (result.type === "file" && result.assetKind === "pdf" && result.location.kind === "page") {
		return {
			itemId: result.itemId,
			kind: "pdf-page",
			pageNumber: result.location.pageNumber,
			version: 1,
		};
	}

	return {
		itemId: result.itemId,
		kind: "item",
		version: 1,
	};
}
