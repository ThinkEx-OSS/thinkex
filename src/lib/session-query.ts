import { type QueryClient, queryOptions } from "@tanstack/react-query";

import { type AuthSession, getSession } from "#/lib/auth.functions";

export const authSessionQueryKey = ["auth", "session"] as const;
export type { AuthSession };

export function getAuthSessionQueryOptions() {
	return queryOptions({
		queryKey: authSessionQueryKey,
		queryFn: () => getSession(),
		staleTime: typeof window !== "undefined" ? Infinity : 0,
		gcTime: typeof window !== "undefined" ? 60 * 60_000 : 0,
		refetchInterval: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: false,
		retry: 1,
	});
}

export function removeAuthSession(queryClient: QueryClient) {
	queryClient.setQueryData<AuthSession | null>(authSessionQueryKey, null);
}

export function refreshAuthSession(queryClient: QueryClient) {
	return queryClient.fetchQuery({
		...getAuthSessionQueryOptions(),
		staleTime: 0,
	});
}
