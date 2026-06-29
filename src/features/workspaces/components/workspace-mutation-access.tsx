import type { SortableDisabled } from "@dnd-kit/dom/sortable";
import { createContext, type ReactNode, useContext } from "react";

import type { WorkspaceMembershipRole } from "#/features/workspaces/contracts";
import {
	getWorkspaceMemberCapabilities,
	type WorkspaceMemberCapabilities,
} from "#/features/workspaces/workspace-member-capabilities";

const readOnlyItemSortableDisabled: SortableDisabled = { droppable: true };

function getWorkspaceItemSortableDisabled(canMutateContent: boolean): boolean | SortableDisabled {
	return canMutateContent ? false : readOnlyItemSortableDisabled;
}

interface WorkspaceMutationAccessContextValue {
	capabilities: WorkspaceMemberCapabilities;
	itemSortableDisabled: boolean | SortableDisabled;
}

const WorkspaceMutationAccessContext = createContext<WorkspaceMutationAccessContextValue | null>(
	null,
);

export function WorkspaceMutationAccessProvider({
	membershipRole,
	children,
}: {
	membershipRole: WorkspaceMembershipRole;
	children: ReactNode;
}) {
	const capabilities = getWorkspaceMemberCapabilities(membershipRole);
	const value = {
		capabilities,
		itemSortableDisabled: getWorkspaceItemSortableDisabled(capabilities.canMutateContent),
	};

	return <WorkspaceMutationAccessContext value={value}>{children}</WorkspaceMutationAccessContext>;
}

export function useWorkspaceMutationAccess() {
	const value = useContext(WorkspaceMutationAccessContext);

	if (!value) {
		throw new Error(
			"useWorkspaceMutationAccess must be used within WorkspaceMutationAccessProvider",
		);
	}

	return value;
}
