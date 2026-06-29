import { Plugin, type UniqueIdentifier } from "@dnd-kit/abstract";
import type { DragDropManager } from "@dnd-kit/dom";
import { isSortable, type Sortable, SortableDroppable } from "@dnd-kit/dom/sortable";
import { move } from "@dnd-kit/helpers";
import { batch } from "@dnd-kit/state";

type SortableGroup = Sortable["group"];
type SortableInstances = Map<SortableGroup, Set<Sortable>>;
type SortableIndices = Map<UniqueIdentifier, number>;

const DEFAULT_GROUP = "__default__";

export class WorkspaceOptimisticSortingPlugin extends Plugin<DragDropManager> {
	constructor(manager: DragDropManager) {
		super(manager);

		const getSortableInstances = () => {
			const sortableInstances: SortableInstances = new Map();

			for (const droppable of manager.registry.droppables) {
				if (droppable instanceof SortableDroppable) {
					const { sortable } = droppable;
					const { group } = sortable;
					let instances = sortableInstances.get(group);

					if (!instances) {
						instances = new Set();
						sortableInstances.set(group, instances);
					}

					instances.add(sortable);
				}
			}

			return sortableInstances;
		};

		const unsubscribe = [
			manager.monitor.addEventListener("dragover", (event, manager) => {
				if (this.disabled) {
					return;
				}

				const { dragOperation } = manager;
				const { source, target } = dragOperation;

				if (!isSortable(source) || !isSortable(target)) {
					return;
				}

				if (source.sortable === target.sortable) {
					return;
				}

				const instances = getSortableInstances();
				const sortableIndices = getSortableIndices(instances);
				const sameGroup = source.sortable.group === target.sortable.group;
				const sourceInstances = instances.get(source.sortable.group);
				const targetInstances = sameGroup ? sourceInstances : instances.get(target.sortable.group);

				if (!sourceInstances || !targetInstances) {
					return;
				}

				queueMicrotask(() => {
					if (event.defaultPrevented) {
						return;
					}

					void manager.renderer.rendering.then(() => {
						const newInstances = getSortableInstances();

						if (hasSortableStateChanged(sortableIndices, instances, newInstances)) {
							return;
						}

						const sourceElement = source.sortable.element;
						const targetElement = target.sortable.element;

						if (!sourceElement || !targetElement) {
							return;
						}

						if (!sameGroup && target.id === source.sortable.group) {
							return;
						}

						const orderedSourceSortables = sortSortables(sourceInstances);
						const orderedTargetSortables = sameGroup
							? orderedSourceSortables
							: sortSortables(targetInstances);
						const sourceGroup = source.sortable.group ?? DEFAULT_GROUP;
						const targetGroup = target.sortable.group ?? DEFAULT_GROUP;
						const state = {
							[sourceGroup]: orderedSourceSortables,
							[targetGroup]: orderedTargetSortables,
						};
						const nextState = move(state, event);

						if (state === nextState) {
							return;
						}

						const sourceIndex = nextState[targetGroup].indexOf(source.sortable);
						const targetIndex = nextState[targetGroup].indexOf(target.sortable);

						manager.collisionObserver.disable();
						reorder(sourceElement, sourceIndex, targetElement, targetIndex);

						batch(() => {
							for (const [index, sortable] of nextState[sourceGroup].entries()) {
								sortable.index = index;
							}

							if (!sameGroup) {
								for (const [index, sortable] of nextState[targetGroup].entries()) {
									sortable.group = target.sortable.group;
									sortable.index = index;
								}
							}
						});

						void manager.actions
							.setDropTarget(source.id)
							.then(() => manager.collisionObserver.enable());
					});
				});
			}),
			manager.monitor.addEventListener("dragend", (event, manager) => {
				const { dragOperation } = manager;
				const { source, target } = dragOperation;

				if (!isSortable(source)) {
					return;
				}

				if (
					!event.canceled &&
					isSortable(target) &&
					source.sortable.group === target.sortable.group
				) {
					return;
				}

				if (
					source.sortable.initialIndex === source.sortable.index &&
					source.sortable.initialGroup === source.sortable.group
				) {
					return;
				}

				queueMicrotask(() => {
					const instances = getSortableInstances();
					const sortableIndices = getSortableIndices(instances);
					const initialGroupInstances = instances.get(source.sortable.initialGroup);

					if (!initialGroupInstances) {
						return;
					}

					void manager.renderer.rendering.then(() => {
						const newInstances = getSortableInstances();

						if (hasSortableStateChanged(sortableIndices, instances, newInstances)) {
							return;
						}

						const currentSortables = sortSortables(initialGroupInstances);
						const initialSortables = sortSortables(initialGroupInstances, sortByInitialIndex);
						const sourceElement = source.sortable.element;
						const initialPosition = initialSortables.indexOf(source.sortable);
						const target = currentSortables[initialPosition];
						const targetElement = target?.element;

						if (!sourceElement || !target || !targetElement) {
							return;
						}

						reorder(sourceElement, target.index, targetElement, source.index);

						batch(() => {
							for (const sortableInstances of instances.values()) {
								for (const sortable of sortableInstances.values()) {
									sortable.index = sortable.initialIndex;
									sortable.group = sortable.initialGroup;
								}
							}
						});
					});
				});
			}),
		];

		this.destroy = () => {
			for (const unsubscribeListener of unsubscribe) {
				unsubscribeListener();
			}
		};
	}
}

function reorder(
	sourceElement: Element,
	sourceIndex: number,
	targetElement: Element,
	targetIndex: number,
) {
	const position = targetIndex < sourceIndex ? "afterend" : "beforebegin";

	targetElement.insertAdjacentElement(position, sourceElement);
}

function getSortableIndices(instances: SortableInstances): SortableIndices {
	const sortableIndices: SortableIndices = new Map();

	for (const [, group] of instances) {
		for (const sortable of group) {
			sortableIndices.set(sortable.id, sortable.index);
		}
	}

	return sortableIndices;
}

function hasSortableStateChanged(
	initialIndices: SortableIndices,
	initialInstances: SortableInstances,
	nextInstances: SortableInstances,
) {
	for (const [group, sortables] of initialInstances) {
		for (const sortable of sortables) {
			const index = initialIndices.get(sortable.id);

			if (
				sortable.index !== index ||
				sortable.group !== group ||
				!nextInstances.get(group)?.has(sortable)
			) {
				return true;
			}
		}
	}

	return false;
}

function sortByIndex(left: Sortable, right: Sortable) {
	return left.index - right.index;
}

function sortByInitialIndex(left: Sortable, right: Sortable) {
	return left.initialIndex - right.initialIndex;
}

function sortSortables(
	instances: Set<Sortable>,
	sortFn: (left: Sortable, right: Sortable) => number = sortByIndex,
) {
	return Array.from(instances).sort(sortFn);
}
