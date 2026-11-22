import { useQuery } from "@tanstack/react-query";

import { listWorkspaceProUserIdsFn } from "#/features/account/billing-functions";

const EMPTY = new Set<string>();
const MAX_CROWN_LOOKUPS = 50;

/**
 * Which of the given workspace members are on Pro, for collaborator crowns.
 *
 * Keyed on the ids being shown, not just the workspace: someone who joins
 * mid-session is a new key and gets looked up at once, instead of waiting out
 * a cached answer from before they were a member. Purely cosmetic, so each
 * answer is cached generously — an upgrade shows up for others within ten
 * minutes, which is soon enough for a hat.
 */
export function useWorkspaceProUserIds(workspaceId: string | undefined, userIds: string[]) {
	const ids = [...new Set(userIds)].sort().slice(0, MAX_CROWN_LOOKUPS);
	const { data } = useQuery({
		queryKey: ["workspace-pro-user-ids", workspaceId, ids],
		queryFn: async () =>
			new Set(
				await listWorkspaceProUserIdsFn({ data: { workspaceId: workspaceId ?? "", userIds: ids } }),
			),
		enabled: Boolean(workspaceId) && ids.length > 0,
		staleTime: 10 * 60 * 1000,
		placeholderData: (previous) => previous,
		retry: false,
	});

	return data ?? EMPTY;
}
