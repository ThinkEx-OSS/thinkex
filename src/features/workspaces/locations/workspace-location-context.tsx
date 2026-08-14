import { FileQuestion, type LucideIcon } from "lucide-react";
import { createContext, type ReactNode, use, useCallback, useState } from "react";

import type { WorkspaceLocation } from "#/features/workspaces/locations/workspace-location";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/contracts";

type WorkspacePdfPageLocation = Extract<WorkspaceLocation, { kind: "pdf-page" }>;
type WorkspaceFlashcardLocation = Extract<WorkspaceLocation, { kind: "flashcard" }>;

type WorkspaceLocationPresentation = {
	Icon: LucideIcon;
	iconClassName: string;
	label: string;
	locatorLabel?: string;
};

type WorkspaceLocationRevealRequest = {
	location: WorkspacePdfPageLocation | WorkspaceFlashcardLocation;
	viewInstanceId: string;
};

type WorkspaceLocationContextValue = {
	consumeRevealRequest: (request: WorkspaceLocationRevealRequest) => void;
	getPresentation: (location: WorkspaceLocation) => WorkspaceLocationPresentation;
	hasItem: (itemId: string) => boolean;
	reveal: (location: WorkspaceLocation) => boolean;
	revealRequest: WorkspaceLocationRevealRequest | null;
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
	const [revealRequest, setRevealRequest] = useState<WorkspaceLocationRevealRequest | null>(null);
	const consumeRevealRequest = useCallback((request: WorkspaceLocationRevealRequest) => {
		setRevealRequest((current) => (current === request ? null : current));
	}, []);
	const value: WorkspaceLocationContextValue = {
		consumeRevealRequest,
		getPresentation(location) {
			const item = itemsById.get(location.itemId);
			const itemName = item?.name ?? "Source unavailable";
			const locatorLabel = getWorkspaceLocatorLabel(location);

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
			return itemsById.has(itemId);
		},
		reveal(location) {
			const viewInstanceId = navigate(location);

			setRevealRequest(
				viewInstanceId && (location.kind === "pdf-page" || location.kind === "flashcard")
					? { location, viewInstanceId }
					: null,
			);
			return Boolean(viewInstanceId);
		},
		revealRequest,
	};

	return <WorkspaceLocationContext value={value}>{children}</WorkspaceLocationContext>;
}

function getWorkspaceLocatorLabel(location: WorkspaceLocation) {
	switch (location.kind) {
		case "item":
			return undefined;
		case "pdf-page":
			return `p. ${location.pageNumber}`;
		case "document-block":
		case "flashcard":
			return undefined;
	}
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
		request:
			revealRequest?.viewInstanceId === viewInstanceId && revealRequest.location.kind === "pdf-page"
				? (revealRequest as WorkspaceLocationRevealRequest & {
						location: WorkspacePdfPageLocation;
					})
				: null,
	};
}

export function useWorkspaceFlashcardRevealRequest(viewInstanceId: string) {
	const { consumeRevealRequest, revealRequest } = useWorkspaceLocationActions();

	return {
		consume: consumeRevealRequest,
		request:
			revealRequest?.viewInstanceId === viewInstanceId &&
			revealRequest.location.kind === "flashcard"
				? (revealRequest as WorkspaceLocationRevealRequest & {
						location: WorkspaceFlashcardLocation;
					})
				: null,
	};
}
