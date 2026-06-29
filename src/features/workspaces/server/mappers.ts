import type { InferSelectModel } from "drizzle-orm";

import type { workspaces } from "#/db/schema";
import type {
	WorkspaceDetail,
	WorkspaceMembershipRole,
	WorkspaceSummary,
} from "#/features/workspaces/contracts";
import { workspaceColorSchema, workspaceIconSchema } from "#/features/workspaces/contracts";
import { DEFAULT_WORKSPACE_COLOR, DEFAULT_WORKSPACE_ICON } from "#/features/workspaces/defaults";

type WorkspaceRow = InferSelectModel<typeof workspaces>;
type WorkspaceSummaryRow = WorkspaceRow & {
	lastOpenedAt?: Date | null;
};

function toIsoString(value: Date | null) {
	return value ? value.toISOString() : null;
}

export function mapWorkspaceRow(
	row: WorkspaceSummaryRow,
	membershipRole: WorkspaceMembershipRole,
): WorkspaceSummary {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		icon: parseWorkspaceIcon(row.icon),
		color: parseWorkspaceColor(row.color),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		lastOpenedAt: toIsoString(row.lastOpenedAt ?? null),
		archivedAt: toIsoString(row.archivedAt),
		membershipRole,
	};
}

export function mapWorkspaceDetailRow(
	row: WorkspaceSummaryRow,
	membershipRole: WorkspaceMembershipRole,
): WorkspaceDetail {
	return mapWorkspaceRow(row, membershipRole);
}

function parseWorkspaceIcon(value: string | null) {
	if (value === null) {
		return null;
	}

	return workspaceIconSchema.safeParse(value).data ?? DEFAULT_WORKSPACE_ICON;
}

function parseWorkspaceColor(value: string | null) {
	if (value === null) {
		return null;
	}

	return workspaceColorSchema.safeParse(value).data ?? DEFAULT_WORKSPACE_COLOR;
}
