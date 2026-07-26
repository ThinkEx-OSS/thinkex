import { FileQuestion, type LucideIcon } from "lucide-react";
import { createContext, type ReactNode, use, useMemo } from "react";

import type { WorkspaceLocation } from "#/features/workspaces/locations/workspace-location";
import type {
	WorkspaceRevealRequest,
	WorkspaceRevealResult,
} from "#/features/workspaces/locations/workspace-location-reveal";
import { getWorkspaceItemDisplay } from "#/features/workspaces/model/item-display";
import type { WorkspaceItem } from "#/features/workspaces/model/types";

type WorkspaceLocationPresentation = {
	Icon: LucideIcon;
	iconClassName: string;
	label: string;
};

type WorkspaceLocationActions = {
	getPresentation: (location: WorkspaceLocation) => WorkspaceLocationPresentation;
	reveal: (request: WorkspaceRevealRequest) => WorkspaceRevealResult;
};

const WorkspaceLocationContext = createContext<WorkspaceLocationActions | null>(null);

/**
 * Connects location-aware UI to the current workspace's items and navigation.
 */
export function WorkspaceLocationProvider({
	children,
	itemsById,
	reveal,
}: {
	readonly children: ReactNode;
	readonly itemsById: ReadonlyMap<string, WorkspaceItem>;
	readonly reveal: WorkspaceLocationActions["reveal"];
}) {
	const value = useMemo<WorkspaceLocationActions>(
		() => ({
			getPresentation(location) {
				const item = itemsById.get(location.itemId);
				const itemName = item?.name ?? "Source unavailable";
				const label =
					location.kind === "pdf-page" ? `${itemName} · p. ${location.pageNumber}` : itemName;

				if (!item) {
					return {
						Icon: FileQuestion,
						iconClassName: "text-muted-foreground",
						label,
					};
				}

				const { Icon, iconClassName } = getWorkspaceItemDisplay(item);
				return { Icon, iconClassName, label };
			},
			reveal,
		}),
		[itemsById, reveal],
	);

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
