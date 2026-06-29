import type { WorkspaceMembershipRole } from "#/features/workspaces/contracts";
import { workspaceRoles } from "#/features/workspaces/contracts";

export type WorkspaceRole = WorkspaceMembershipRole;

export { workspaceRoles };

export const workspaceRoleRank: Record<WorkspaceRole, number> = {
	viewer: 0,
	editor: 1,
	admin: 2,
	owner: 3,
};

export const defaultInviteLinkExpiryMs = 7 * 24 * 60 * 60 * 1000;

export function canGrantRole(inviterRole: WorkspaceRole, grantedRole: WorkspaceRole) {
	if (grantedRole === "owner") {
		return false;
	}

	return workspaceRoleRank[grantedRole] <= workspaceRoleRank[inviterRole];
}

export function canManageMember(actorRole: WorkspaceRole, targetRole: WorkspaceRole) {
	if (targetRole === "owner") {
		return false;
	}

	if (actorRole === "owner") {
		return true;
	}

	if (actorRole === "admin") {
		return targetRole === "editor" || targetRole === "viewer";
	}

	return false;
}

export function isInviteExpired(expiresAt: Date | null, now = new Date()) {
	return expiresAt !== null && expiresAt.getTime() <= now.getTime();
}

export function getDefaultInviteLinkExpiresAt(now = new Date()) {
	return new Date(now.getTime() + defaultInviteLinkExpiryMs);
}

export function createInviteToken() {
	return crypto.randomUUID().replaceAll("-", "");
}

export function getGrantableInviteRoles(inviterRole: WorkspaceRole) {
	return workspaceRoles.filter((role) => canGrantRole(inviterRole, role));
}

export function getDefaultInviteRole(inviterRole: WorkspaceRole): WorkspaceRole {
	const grantableRoles = getGrantableInviteRoles(inviterRole);

	if (grantableRoles.includes("editor")) {
		return "editor";
	}

	return grantableRoles.at(-1) ?? "viewer";
}

export function getAssignableMemberRoles(actorRole: WorkspaceRole): WorkspaceRole[] {
	return getGrantableInviteRoles(actorRole).filter(
		(role) => actorRole === "owner" || role !== "admin",
	);
}

const inviteEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeInviteEmail(email: string) {
	return email.trim().toLowerCase();
}

export function isValidInviteEmail(email: string) {
	return inviteEmailPattern.test(normalizeInviteEmail(email));
}
