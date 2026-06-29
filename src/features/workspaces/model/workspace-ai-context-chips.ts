import {
	getOpenTabItemIds,
	getWorkspaceAiContextItemReference,
	getWorkspaceAiContextVisibleItemIds,
} from "./workspace-ai-context-reference";
import type { WorkspaceAiContextChip, WorkspaceAiContextScope } from "./workspace-ai-context-types";
import { formatWorkspaceAiContextItemViewState } from "./workspace-item-view-state";

export function getWorkspaceAiContextChips(
	context: WorkspaceAiContextScope,
): WorkspaceAiContextChip[] {
	const openTabItemIds = getOpenTabItemIds(context.tabs);
	const selectedItemIds = new Set(context.selectedItemIds);
	const visibleItemIds = getWorkspaceAiContextVisibleItemIds(context);
	const chips: WorkspaceAiContextChip[] = [];
	const pushItemChip = (itemId: string) => {
		const item = context.itemsById.get(itemId);

		if (!item) {
			return;
		}

		const reference = getWorkspaceAiContextItemReference({
			item,
			context,
			openTabItemIds,
			visibleItemIds,
		});

		chips.push({
			viewStateLabel: formatWorkspaceAiContextItemViewState(reference.state.viewState),
			id: item.id,
			item,
			isActiveVisible: reference.state.activeVisible,
			isSelected: selectedItemIds.has(item.id),
			label: reference.name,
			path: reference.path,
		});
	};

	for (const itemId of visibleItemIds) {
		pushItemChip(itemId);
	}

	for (const itemId of context.selectedItemIds) {
		if (!visibleItemIds.has(itemId)) {
			pushItemChip(itemId);
		}
	}

	return chips;
}
