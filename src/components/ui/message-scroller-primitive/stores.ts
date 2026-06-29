import type { MessageScrollerScrollable, MessageScrollerStore } from "./types";

// Generic useSyncExternalStore backing: a stable snapshot (referentially equal
// while isEqual holds, so subscribers only re-render on real transitions).
function createExternalStore<T>(initialSnapshot: T, isEqual: (a: T, b: T) => boolean) {
	let snapshot = initialSnapshot;
	const listeners = new Set<() => void>();

	return {
		getSnapshot: () => snapshot,
		setSnapshot: (nextSnapshot: T) => {
			if (isEqual(snapshot, nextSnapshot)) {
				return;
			}

			snapshot = nextSnapshot;
			listeners.forEach((listener) => listener());
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener);

			return () => {
				listeners.delete(listener);
			};
		},
	};
}

function createMessageScrollerStore<T>(
	initialSnapshot: T,
	isEqual: (a: T, b: T) => boolean,
): MessageScrollerStore<T> {
	return createExternalStore(initialSnapshot, isEqual);
}

function areScrollStatesEqual(current: MessageScrollerScrollable, next: MessageScrollerScrollable) {
	return current.start === next.start && current.end === next.end;
}

export { areScrollStatesEqual, createMessageScrollerStore };
