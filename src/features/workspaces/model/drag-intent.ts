import { move } from "@dnd-kit/helpers";
import type { DragDropEventHandlers } from "@dnd-kit/react";

import type { MoveWorkspaceItemsInput } from "#/features/workspaces/contracts";
import type { WorkspaceItem } from "#/features/workspaces/model/types";

import { getWorkspaceDragSource, getWorkspaceDropTarget } from "./drag-targets";
import type { WorkspaceDragCommand, WorkspaceDragEndEvent } from "./drag-types";

export type DndDragEndEvent = Parameters<NonNullable<DragDropEventHandlers["onDragEnd"]>>[0];

export type WorkspaceDropIntent =
	| { kind: "workspace-drag-command"; command: WorkspaceDragCommand }
	| { kind: "move-items"; input: MoveWorkspaceItemsInput };

export function getWorkspaceDropIntent(input: {
	event: DndDragEndEvent;
	items: WorkspaceItem[];
	workspaceId: string;
}): WorkspaceDropIntent | undefined {
	const command = getWorkspaceDragCommand(input.event);

	if (command) {
		return { kind: "workspace-drag-command", command };
	}

	const moveInput = getWorkspaceItemMoveInput(input);

	if (moveInput) {
		return {
			kind: "move-items",
			input: moveInput,
		};
	}

	return undefined;
}

export function getWorkspaceDragCommand(
	event: WorkspaceDragEndEvent,
): WorkspaceDragCommand | undefined {
	const { source, target } = event.operation;
	const canceled = event.canceled ?? event.operation.canceled;

	if (canceled || !source) {
		return undefined;
	}

	const dragSource = getWorkspaceDragSource(source);

	if (dragSource?.kind !== "tab") {
		return undefined;
	}

	if (
		typeof source.index === "number" &&
		typeof source.initialIndex === "number" &&
		source.index !== source.initialIndex
	) {
		return {
			type: "move-tab-in-strip",
			tabId: dragSource.tabId,
			toIndex: source.index,
		};
	}

	const dropTarget = getWorkspaceDropTarget(target);

	if (dropTarget?.kind === "tab") {
		return {
			type: "reorder-tabs-over-tab",
			activeTabId: dragSource.tabId,
			overTabId: dropTarget.tabId,
		};
	}

	return undefined;
}

export function getWorkspaceItemMoveInput(input: {
	event: DndDragEndEvent;
	items: WorkspaceItem[];
	workspaceId: string;
}): MoveWorkspaceItemsInput | undefined {
	const { event, items, workspaceId } = input;
	const { source, target } = event.operation;
	const canceled = event.canceled ?? event.operation.canceled;
	const dragSource = getWorkspaceDragSource(source);
	const dropTarget = getWorkspaceDropTarget(target);

	if (canceled || dragSource?.kind !== "workspace-item") {
		return undefined;
	}

	const movedItem = items.find((item) => item.id === dragSource.itemId);

	if (!movedItem) {
		return undefined;
	}

	if (dropTarget?.kind === "workspace-folder") {
		if (
			movedItem.id === dropTarget.folderId ||
			movedItem.parentId === dropTarget.folderId ||
			isWorkspaceItemDescendantOf(items, {
				ancestorId: movedItem.id,
				itemId: dropTarget.folderId,
			})
		) {
			return undefined;
		}

		return {
			workspaceId,
			items: [{ itemId: movedItem.id }],
			parentId: dropTarget.folderId,
		};
	}

	if (dropTarget?.kind !== "workspace-item" || dropTarget.row !== dragSource.row) {
		return undefined;
	}

	const targetItem = items.find((item) => item.id === dropTarget.itemId);

	if (!targetItem || targetItem.parentId !== movedItem.parentId) {
		return undefined;
	}

	const siblings = items
		.filter(
			(item) =>
				item.parentId === movedItem.parentId &&
				(dragSource.row === "folder" ? item.type === "folder" : item.type !== "folder"),
		)
		.sort(compareWorkspaceItems);
	const currentIds = siblings.map((item) => item.id);
	const currentIndex = currentIds.indexOf(movedItem.id);
	const orderedIds = move(currentIds, event);
	const nextIndex = orderedIds.indexOf(movedItem.id);

	if (currentIndex < 0 || nextIndex < 0 || currentIndex === nextIndex) {
		return undefined;
	}

	const previousId = nextIndex > 0 ? orderedIds[nextIndex - 1] : undefined;
	const nextId = nextIndex < orderedIds.length - 1 ? orderedIds[nextIndex + 1] : undefined;
	const siblingsById = new Map(siblings.map((item) => [item.id, item]));
	const sortOrder = getSortOrderBetween({
		previous: previousId ? siblingsById.get(previousId) : undefined,
		next: nextId ? siblingsById.get(nextId) : undefined,
	});

	return {
		workspaceId,
		items: [{ itemId: movedItem.id, sortOrder }],
		parentId: movedItem.parentId,
	};
}

export function shouldPreventWorkspacePointerActivation(
	event: PointerEvent,
	source: { element?: Element; handle?: Element },
) {
	const { target } = event;

	if (!(target instanceof Element)) {
		return false;
	}

	if (target.closest("[data-workspace-drag-open]")) {
		return false;
	}

	if (target === source.element || target === source.handle) {
		return false;
	}

	if (source.handle?.contains(target)) {
		return false;
	}

	const interactiveElement = target.closest(
		[
			"input:not([disabled])",
			"select:not([disabled])",
			"textarea:not([disabled])",
			"button:not([disabled])",
			"a[href]",
			'[contenteditable]:not([contenteditable="false"])',
		].join(","),
	);

	if (interactiveElement === source.element) {
		return false;
	}

	return Boolean(interactiveElement);
}

function compareWorkspaceItems(left: WorkspaceItem, right: WorkspaceItem) {
	const sortDelta = left.sortOrder - right.sortOrder;

	if (sortDelta !== 0) {
		return sortDelta;
	}

	return left.name.localeCompare(right.name);
}

function getSortOrderBetween(input: { previous?: WorkspaceItem; next?: WorkspaceItem }) {
	if (input.previous && input.next) {
		return Math.floor((input.previous.sortOrder + input.next.sortOrder) / 2);
	}

	if (input.previous) {
		return input.previous.sortOrder + 1024;
	}

	if (input.next) {
		return Math.max(0, input.next.sortOrder - 1024);
	}

	return 1024;
}

function isWorkspaceItemDescendantOf(
	items: WorkspaceItem[],
	input: { ancestorId: string; itemId: string },
) {
	const itemsById = new Map(items.map((item) => [item.id, item]));
	let current = itemsById.get(input.itemId);
	const seen = new Set<string>();

	while (current?.parentId) {
		if (current.parentId === input.ancestorId) {
			return true;
		}

		if (seen.has(current.parentId)) {
			return false;
		}

		seen.add(current.parentId);
		current = itemsById.get(current.parentId);
	}

	return false;
}
