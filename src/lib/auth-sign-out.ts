import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter, NavigateOptions } from "@tanstack/react-router";

import { authClient } from "#/lib/auth-client";
import { removeAuthSession } from "#/lib/session-query";

interface ClearLocalAuthSessionInput {
	queryClient: QueryClient;
	router: AnyRouter;
	navigate: (options: NavigateOptions) => Promise<void>;
	replace?: boolean;
}

export async function clearLocalAuthSession(input: ClearLocalAuthSessionInput) {
	removeAuthSession(input.queryClient);
	await input.router.invalidate();
	await input.navigate({ to: "/", replace: input.replace });
}

export async function signOutCurrentUser(input: ClearLocalAuthSessionInput) {
	await authClient.signOut();
	await clearLocalAuthSession(input);
}
