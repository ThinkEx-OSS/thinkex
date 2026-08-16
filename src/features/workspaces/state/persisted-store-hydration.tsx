import { useEffect, useSyncExternalStore } from "react";

import { useWorkspaceTabsStore } from "#/features/workspaces/state/workspace-tabs-store";
import { useWorkspaceUiStore } from "#/features/workspaces/state/workspace-ui-store";

type PersistedStore = {
	persist: {
		hasHydrated: () => boolean;
		onFinishHydration: (listener: () => void) => () => void;
		rehydrate: () => Promise<void> | void;
	};
};

const persistedStores = [useWorkspaceTabsStore, useWorkspaceUiStore] as const;

function hasHydratedAllStores() {
	return persistedStores.every((store) => store.persist.hasHydrated());
}

function subscribeToHydration(listener: () => void) {
	const unsubscribers = persistedStores.map((store) => store.persist.onFinishHydration(listener));

	return () => {
		for (const unsubscribe of unsubscribers) {
			unsubscribe();
		}
	};
}

export function useWorkspacePersistedStoresHydrated() {
	return useSyncExternalStore(subscribeToHydration, hasHydratedAllStores, () => false);
}

export function WorkspacePersistedStoresHydrator() {
	useEffect(() => {
		for (const store of persistedStores satisfies readonly PersistedStore[]) {
			if (!store.persist.hasHydrated()) {
				void store.persist.rehydrate();
			}
		}
	}, []);

	return null;
}
