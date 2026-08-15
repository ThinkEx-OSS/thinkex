import { FileQuestion, type LucideIcon } from "lucide-react";
import { createContext, type ReactNode, use, useCallback, useState } from "react";
import { toast } from "sonner";

import {
	parseWorkspaceAddress,
	resolveWorkspaceAddressLocation,
	type WorkspaceLocation,
} from "#/features/workspaces/locations/workspace-location";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/contracts";

type WorkspaceRevealLocation = Exclude<WorkspaceLocation, { kind: "item" }>;

type WorkspaceLocationPresentation = {
	Icon: LucideIcon;
	iconClassName: string;
	label: string;
	locatorLabel?: string;
};

type WorkspaceLocationRevealRequest = {
	location: WorkspaceRevealLocation;
	viewInstanceId: string;
};

type WorkspaceLocationContextValue = {
	completeRevealRequest: (request: WorkspaceLocationRevealRequest, revealed: boolean) => void;
	getItem: (itemId: string) => WorkspaceItem | undefined;
	getPresentation: (location: WorkspaceLocation) => WorkspaceLocationPresentation;
	/** Resolves a self-describing address like `Xk7p2Qa9/p5` against the live workspace. */
	resolveAddress: (ref: unknown) => WorkspaceLocation | undefined;
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
	const completeRevealRequest = useCallback(
		(request: WorkspaceLocationRevealRequest, revealed: boolean) => {
			if (revealRequest !== request) return;
			if (!revealed) toast.error("This source is no longer available.");
			setRevealRequest(null);
		},
		[revealRequest],
	);
	const value: WorkspaceLocationContextValue = {
		completeRevealRequest,
		getItem(itemId) {
			return itemsById.get(itemId);
		},
		resolveAddress(ref) {
			const address = typeof ref === "string" ? parseWorkspaceAddress(ref) : undefined;
			if (!address) return undefined;
			for (const item of itemsById.values()) {
				if (item.refKey === address.refKey) {
					return resolveWorkspaceAddressLocation(item, address);
				}
			}
			return undefined;
		},
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
		reveal(location) {
			const viewInstanceId = navigate(location);

			setRevealRequest(
				viewInstanceId && location.kind !== "item" ? { location, viewInstanceId } : null,
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
		case "quiz-question":
			// Content-positional labels ("Card 3", "Question 3") need the item's
			// current content, so the citation component supplies them.
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

export function useWorkspaceRevealRequest<TKind extends WorkspaceRevealLocation["kind"]>(
	viewInstanceId: string,
	kind: TKind,
) {
	const { completeRevealRequest, revealRequest } = useWorkspaceLocationActions();

	return {
		complete: completeRevealRequest,
		request:
			revealRequest?.viewInstanceId === viewInstanceId && revealRequest.location.kind === kind
				? (revealRequest as WorkspaceLocationRevealRequest & {
						location: Extract<WorkspaceRevealLocation, { kind: TKind }>;
					})
				: null,
	};
}
