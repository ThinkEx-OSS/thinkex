import {
	assertAccessScope,
	createAccessActor,
	type ScopedAccessContext,
} from "#/features/workspaces/operations/access-context";

export const accountAccessScopes = ["workspaces:read"] as const;

export type AccountAccessScope = (typeof accountAccessScopes)[number];

export type AccountAccessContext = ScopedAccessContext<AccountAccessScope>;

export function createAccountAccessContext(input: {
	scopes: readonly AccountAccessScope[];
	userId: string;
}): AccountAccessContext {
	return {
		actor: createAccessActor(input),
	};
}

export function assertAccountAccessScope(context: AccountAccessContext, scope: AccountAccessScope) {
	assertAccessScope(context, "account", scope);
}
