import { QueryClient } from "@tanstack/react-query";

import type { AuthSession } from "#/lib/session-query";

export function getContext() {
	const queryClient = new QueryClient();

	return {
		queryClient,
		session: null as AuthSession | null,
	};
}
