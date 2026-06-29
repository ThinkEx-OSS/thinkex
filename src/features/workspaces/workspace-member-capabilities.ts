import type { WorkspaceMembershipRole } from "#/features/workspaces/contracts";

export interface WorkspaceMemberCapabilities {
	role: WorkspaceMembershipRole;
	canMutateContent: boolean;
	canDeleteWorkspace: boolean;
}

export function getWorkspaceMemberCapabilities(
	role: WorkspaceMembershipRole,
): WorkspaceMemberCapabilities {
	const canMutateContent = role !== "viewer";

	return {
		role,
		canMutateContent,
		canDeleteWorkspace: role === "owner",
	};
}
