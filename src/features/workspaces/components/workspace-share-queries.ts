import { type QueryClient, queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import type { WorkspaceMembershipRole } from "#/features/workspaces/contracts";
import {
	getWorkspaceInviteLinkFn,
	listWorkspaceEmailInvitesFn,
} from "#/features/workspaces/invites/workspace-invite-functions";
import { isInviteExpired } from "#/features/workspaces/invites/workspace-invite-rules";
import { listWorkspaceMembersFn } from "#/features/workspaces/members/workspace-member-functions";

export type WorkspaceInviteLinkResult = Awaited<ReturnType<typeof getWorkspaceInviteLinkFn>>;

function parseInviteExpiresAt(expiresAt: Date | string | null | undefined) {
	if (expiresAt == null) {
		return null;
	}

	if (expiresAt instanceof Date) {
		return expiresAt;
	}

	const parsed = new Date(expiresAt);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isWorkspaceInviteLinkCacheValid(data: WorkspaceInviteLinkResult | undefined) {
	if (!data?.path) {
		return false;
	}

	return !isInviteExpired(parseInviteExpiresAt(data.expiresAt));
}

function getInviteLinkStaleTime(
	data: WorkspaceInviteLinkResult | undefined,
	dataUpdatedAt: number,
) {
	if (!isWorkspaceInviteLinkCacheValid(data)) {
		return 0;
	}

	const expiresAt = parseInviteExpiresAt(data?.expiresAt);
	if (!expiresAt || dataUpdatedAt === 0) {
		return 0;
	}

	// Fresh until expiresAt: stale when now - dataUpdatedAt > expiresAt - dataUpdatedAt.
	return Math.max(0, expiresAt.getTime() - dataUpdatedAt);
}

export function getWorkspaceMembersQueryKey(workspaceId: string) {
	return ["workspace-members", workspaceId] as const;
}

export function getWorkspaceEmailInvitesQueryKey(workspaceId: string) {
	return ["workspace-email-invites", workspaceId] as const;
}

export function getWorkspaceInviteLinkQueryKey(workspaceId: string, role: WorkspaceMembershipRole) {
	return ["workspace-invite-link", workspaceId, role] as const;
}

export function getWorkspaceMembersQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: getWorkspaceMembersQueryKey(workspaceId),
		queryFn: () => listWorkspaceMembersFn({ data: { workspaceId } }),
	});
}

export function getWorkspaceEmailInvitesQueryOptions(workspaceId: string) {
	return queryOptions({
		queryKey: getWorkspaceEmailInvitesQueryKey(workspaceId),
		queryFn: () => listWorkspaceEmailInvitesFn({ data: { workspaceId } }),
	});
}

export function getWorkspaceInviteLinkQueryOptions(
	workspaceId: string,
	role: WorkspaceMembershipRole,
) {
	return queryOptions({
		queryKey: getWorkspaceInviteLinkQueryKey(workspaceId, role),
		queryFn: () =>
			getWorkspaceInviteLinkFn({
				data: {
					workspaceId,
					role,
				},
			}),
		staleTime: (query) =>
			getInviteLinkStaleTime(
				query.state.data as WorkspaceInviteLinkResult | undefined,
				query.state.dataUpdatedAt,
			),
	});
}

export async function resolveWorkspaceInviteLink(
	queryClient: QueryClient,
	workspaceId: string,
	role: WorkspaceMembershipRole,
) {
	const options = getWorkspaceInviteLinkQueryOptions(workspaceId, role);
	const cached = queryClient.getQueryData<WorkspaceInviteLinkResult>(options.queryKey);

	if (isWorkspaceInviteLinkCacheValid(cached)) {
		return cached as WorkspaceInviteLinkResult;
	}

	return queryClient.fetchQuery(options);
}

export function prefetchWorkspaceInviteLinks(
	queryClient: QueryClient,
	workspaceId: string,
	roles: readonly WorkspaceMembershipRole[],
) {
	return Promise.all(
		roles.map((role) =>
			queryClient.prefetchQuery(getWorkspaceInviteLinkQueryOptions(workspaceId, role)),
		),
	);
}

export function useWorkspaceShareDialogQueries({
	grantableRoles,
	open,
	workspaceId,
}: {
	grantableRoles: WorkspaceMembershipRole[];
	open: boolean;
	workspaceId: string;
}) {
	const queryClient = useQueryClient();

	const membersQuery = useQuery({
		...getWorkspaceMembersQueryOptions(workspaceId),
		enabled: open,
	});

	const emailInvitesQuery = useQuery({
		...getWorkspaceEmailInvitesQueryOptions(workspaceId),
		enabled: open,
	});

	useEffect(() => {
		if (!open || grantableRoles.length === 0) {
			return;
		}

		void prefetchWorkspaceInviteLinks(queryClient, workspaceId, grantableRoles);
	}, [grantableRoles, open, queryClient, workspaceId]);

	return {
		emailInvites: emailInvitesQuery.data ?? [],
		isLoading: membersQuery.isLoading || emailInvitesQuery.isLoading,
		members: membersQuery.data ?? [],
	};
}
