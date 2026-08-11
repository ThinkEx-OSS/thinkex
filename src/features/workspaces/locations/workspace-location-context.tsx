import { FileQuestion, type LucideIcon } from "lucide-react";
import { createContext, type ReactNode, use, useCallback, useMemo, useState } from "react";

import type { WorkspaceLocation } from "#/features/workspaces/locations/workspace-location";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/model/types";

type WorkspacePdfPageLocation = Extract<WorkspaceLocation, { kind: "pdf-page" }>;

type WorkspaceLocationPresentation = {
	Icon: LucideIcon;
	iconClassName: string;
	label: string;
	locatorLabel?: string;
};

type WorkspacePdfPageRevealRequest = {
	location: WorkspacePdfPageLocation;
	viewInstanceId: string;
};

type WorkspaceLocationContextValue = {
	consumeRevealRequest: (request: WorkspacePdfPageRevealRequest) => void;
	getPresentation: (location: WorkspaceLocation) => WorkspaceLocationPresentation;
	hasItem: (itemId: string) => boolean;
	reveal: (location: WorkspaceLocation) => boolean;
	revealRequest: WorkspacePdfPageRevealRequest | null;
};

const WorkspaceLocationContext = createContext<WorkspaceLocationContextValue | null>(null);

/**
 * Connects location-aware UI to the current workspace's items and navigation.
 */
export function WorkspaceLocationProvider({
	children,
	itemsById,
	navigate,
}: {
	readonly children: ReactNode;
	readonly itemsById: ReadonlyMap<string, WorkspaceItem>;
	readonly navigate: (location: WorkspaceLocation) => string | undefined;
}) {
	const [revealRequest, setRevealRequest] = useState<WorkspacePdfPageRevealRequest | null>(null);
	const legacyItemsById = useMemo(() => {
		const aliases = new Map<string, WorkspaceItem>();
		for (const item of itemsById.values()) {
			const legacyItemId = item.metadataJson.legacyItemId;
			if (typeof legacyItemId === "string") aliases.set(legacyItemId, item);
		}
		return aliases;
	}, [itemsById]);
	const resolveItem = useCallback(
		(itemId: string) => itemsById.get(itemId) ?? legacyItemsById.get(itemId),
		[itemsById, legacyItemsById],
	);
	const consumeRevealRequest = useCallback((request: WorkspacePdfPageRevealRequest) => {
		setRevealRequest((current) => (current === request ? null : current));
	}, []);
	const value: WorkspaceLocationContextValue = {
		consumeRevealRequest,
		getPresentation(location) {
			const item = resolveItem(location.itemId);
			const itemName = item?.name ?? "Source unavailable";
			const locatorLabel = location.kind === "pdf-page" ? `p. ${location.pageNumber}` : undefined;

			if (!item) {
				return {
					Icon: FileQuestion,
					iconClassName: "text-muted-foreground",
					label: itemName,
					locatorLabel,
				};
			}

			const { Icon, iconClassName } = getWorkspaceItemDisplay(item);
			return { Icon, iconClassName, label: itemName, locatorLabel };
		},
		hasItem(itemId) {
			return Boolean(resolveItem(itemId));
		},
		reveal(location) {
			const item = resolveItem(location.itemId);
			const resolvedLocation = item ? { ...location, itemId: item.id } : location;
			const viewInstanceId = navigate(resolvedLocation);

			setRevealRequest(
				viewInstanceId && resolvedLocation.kind === "pdf-page"
					? { location: resolvedLocation, viewInstanceId }
					: null,
			);
			return Boolean(viewInstanceId);
		},
		revealRequest,
	};

	return <WorkspaceLocationContext value={value}>{children}</WorkspaceLocationContext>;
}

/**
 * Returns the current workspace's location presentation and reveal operations.
 */
export function useWorkspaceLocationActions() {
	const value = use(WorkspaceLocationContext);
	if (!value) {
		throw new Error("Workspace location actions require a workspace shell.");
	}

	return value;
}

/**
 * Returns the latest PDF-page reveal request when it targets this mounted view.
 */
export function useWorkspacePdfPageRevealRequest(viewInstanceId: string) {
	const { consumeRevealRequest, revealRequest } = useWorkspaceLocationActions();

	return {
		consume: consumeRevealRequest,
		request: revealRequest?.viewInstanceId === viewInstanceId ? revealRequest : null,
	};
}
