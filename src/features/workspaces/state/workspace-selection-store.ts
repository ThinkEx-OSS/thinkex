import { useMemo } from "react";
import { create } from "zustand";
import { devtools } from "zustand/middleware";

import { zustandDevtoolsOptions } from "#/lib/zustand-devtools";

type WorkspaceSelectionInput = {
	workspaceId: string;
};

type WorkspaceSelectionItemIdsInput = WorkspaceSelectionInput & {
	itemIds: Iterable<string>;
	validItemIds?: ReadonlySet<string>;
};

type WorkspaceSelectionItemInput = WorkspaceSelectionInput & {
	itemId: string;
	selected: boolean;
};

type WorkspaceSelectionPruneInput = WorkspaceSelectionInput & {
	validItemIds: ReadonlySet<string>;
};

type WorkspaceSelectionState = {
	itemIdsByWorkspaceId: Record<string, string[] | undefined>;
	clearSelection: (input: WorkspaceSelectionInput) => void;
	pruneSelection: (input: WorkspaceSelectionPruneInput) => void;
	setItemSelected: (input: WorkspaceSelectionItemInput) => void;
	setSelectedItemIds: (input: WorkspaceSelectionItemIdsInput) => void;
};

const EMPTY_WORKSPACE_SELECTION_ITEM_IDS: readonly string[] = [];

export function useWorkspaceSelectionItemIds(workspaceId: string) {
	return useWorkspaceSelectionStore(
		useMemo(
			() => (state: WorkspaceSelectionState) =>
				state.itemIdsByWorkspaceId[workspaceId] ?? EMPTY_WORKSPACE_SELECTION_ITEM_IDS,
			[workspaceId],
		),
	);
}

export const useWorkspaceSelectionStore = create<WorkspaceSelectionState>()(
	devtools(
		(set) => ({
			itemIdsByWorkspaceId: {},
			clearSelection: ({ workspaceId }) =>
				set((state) => getNextWorkspaceSelectionState(state, workspaceId, [])),
			pruneSelection: ({ workspaceId, validItemIds }) =>
				set((state) => {
					const currentItemIds = state.itemIdsByWorkspaceId[workspaceId];

					if (!currentItemIds) {
						return state;
					}

					return getNextWorkspaceSelectionState(
						state,
						workspaceId,
						getValidWorkspaceSelectionItemIds(currentItemIds, validItemIds),
					);
				}),
			setItemSelected: ({ workspaceId, itemId, selected }) =>
				set((state) => {
					const currentItemIds = state.itemIdsByWorkspaceId[workspaceId] ?? [];
					const nextItemIds = selected
						? appendWorkspaceSelectionItemId(currentItemIds, itemId)
						: currentItemIds.filter((currentId) => currentId !== itemId);

					return getNextWorkspaceSelectionState(state, workspaceId, nextItemIds);
				}),
			setSelectedItemIds: ({ workspaceId, itemIds, validItemIds }) =>
				set((state) =>
					getNextWorkspaceSelectionState(
						state,
						workspaceId,
						getValidWorkspaceSelectionItemIds(itemIds, validItemIds),
					),
				),
		}),
		zustandDevtoolsOptions("WorkspaceSelectionStore"),
	),
);

function getValidWorkspaceSelectionItemIds(
	itemIds: Iterable<string>,
	validItemIds?: ReadonlySet<string>,
) {
	const nextItemIds: string[] = [];
	const seenItemIds = new Set<string>();

	for (const itemId of itemIds) {
		if (seenItemIds.has(itemId) || (validItemIds && !validItemIds.has(itemId))) {
			continue;
		}

		seenItemIds.add(itemId);
		nextItemIds.push(itemId);
	}

	return nextItemIds;
}

function appendWorkspaceSelectionItemId(itemIds: readonly string[], itemId: string) {
	return itemIds.includes(itemId) ? [...itemIds] : [...itemIds, itemId];
}

function getNextWorkspaceSelectionState(
	state: WorkspaceSelectionState,
	workspaceId: string,
	itemIds: string[],
) {
	const currentItemIds = state.itemIdsByWorkspaceId[workspaceId] ?? [];

	if (areArraysEqual(currentItemIds, itemIds)) {
		return state;
	}

	return {
		itemIdsByWorkspaceId: {
			...state.itemIdsByWorkspaceId,
			[workspaceId]: itemIds,
		},
	};
}

function areArraysEqual(first: readonly string[], second: readonly string[]) {
	if (first.length !== second.length) {
		return false;
	}

	return first.every((value, index) => value === second[index]);
}
