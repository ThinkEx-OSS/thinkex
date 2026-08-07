import { useQuery } from "@tanstack/react-query";

import { getWorkspaceBillingStateFn } from "#/features/account/billing-functions";

export const BILLING_STATE_QUERY_KEY = ["billing-state"] as const;

/**
 * Replaces Autumn's `useCustomer`, which they deprecated in favour of their
 * backend SDK. Everything now goes through our own server functions, so the
 * secret key stays server-side and the browser never loads their SDK.
 *
 * `exact` is for the places that print a number. The composer only says which
 * side of a limit you're on, and is wrong for a few seconds at worst; the plan
 * panel says "412 of 500" and being wrong there is the whole complaint. So the
 * panel refetches whenever it opens, and everything else shares the result.
 */
export function useBillingState({ exact = false } = {}) {
	const { data, isLoading, isError } = useQuery({
		queryKey: BILLING_STATE_QUERY_KEY,
		queryFn: () => getWorkspaceBillingStateFn(),
		// Long enough that alt-tabbing around a chat doesn't refetch constantly.
		// The server gate is the real enforcement; this only drives disclosure.
		staleTime: 60_000,
		refetchOnMount: exact ? "always" : true,
		// Not here for accuracy — a stale balance that hands out an extra message
		// costs a fraction of a cent, and the server gate catches it anyway. It is
		// here because staleness in the other direction disables the composer: a
		// session left open across the monthly refill would keep reading last
		// month's empty balance and lock the user out of an allowance they already
		// have. Five minutes is the ceiling on that, not a sync interval. Only runs
		// while the tab is focused, which is the case focus refetching cannot cover.
		refetchInterval: 5 * 60 * 1000,
	});

	return {
		balances: data?.balances,
		isPending: isLoading || isError,
		isPro: data?.isPro ?? false,
	};
}
