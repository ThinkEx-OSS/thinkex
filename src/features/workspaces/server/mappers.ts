import type { InferSelectModel } from "drizzle-orm";

import type { workspaces } from "#/db/schema";
import {
	type WorkspaceMembershipRole,
	type WorkspaceSummary,
	workspaceColorSchema,
	workspaceIconSchema,
	workspaceThemeSchema,
} from "#/features/workspaces/contracts";
import { DEFAULT_WORKSPACE_COLOR, DEFAULT_WORKSPACE_ICON } from "#/features/workspaces/defaults";

type WorkspaceRow = InferSelectModel<typeof workspaces>;
interface WorkspaceSummaryMembership {
	archivedAt?: Date | null;
	lastOpenedAt?: Date | null;
	role: WorkspaceMembershipRole;
}

function toIsoString(value: Date | null) {
	return value ? value.toISOString() : null;
}

export function mapWorkspaceRow(
	row: WorkspaceRow,
	membership: WorkspaceSummaryMembership,
): WorkspaceSummary {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		icon: parseWorkspaceIcon(row.icon),
		color: parseWorkspaceColor(row.color),
		theme: parseWorkspaceTheme(row.theme),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		lastOpenedAt: toIsoString(membership.lastOpenedAt ?? null),
		archivedForCurrentUserAt: toIsoString(membership.archivedAt ?? null),
		membershipRole: membership.role,
	};
}

function parseWorkspaceIcon(value: string | null) {
	if (value === null) {
		return null;
	}

	return workspaceIconSchema.safeParse(value).data ?? DEFAULT_WORKSPACE_ICON;
}

function parseWorkspaceTheme(value: string | null) {
	if (value === null) {
		return null;
	}

	// Unknown values (stale client, retired theme) degrade to null rather than
	// reaching the UI, where they would resolve to no artwork at all.
	return workspaceThemeSchema.safeParse(value).data ?? null;
}

function parseWorkspaceColor(value: string | null) {
	if (value === null) {
		return null;
	}

	return workspaceColorSchema.safeParse(value).data ?? DEFAULT_WORKSPACE_COLOR;
}
