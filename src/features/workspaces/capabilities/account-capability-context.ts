export const accountCapabilityScopes = ["workspaces:read"] as const;

export type AccountCapabilityScope = (typeof accountCapabilityScopes)[number];

export interface AccountCapabilityActor {
	scopes: ReadonlySet<AccountCapabilityScope>;
	userId: string;
}

export interface AccountCapabilityContext {
	actor: AccountCapabilityActor;
}

export class AccountCapabilityScopeError extends Error {
	constructor(scope: AccountCapabilityScope) {
		super(`Missing account capability scope: ${scope}`);
		this.name = "AccountCapabilityScopeError";
	}
}

export function createAccountCapabilityContext(input: {
	scopes: readonly AccountCapabilityScope[];
	userId: string;
}): AccountCapabilityContext {
	return {
		actor: {
			scopes: new Set(input.scopes),
			userId: input.userId,
		},
	};
}

export function assertAccountCapabilityScope(
	context: AccountCapabilityContext,
	scope: AccountCapabilityScope,
) {
	if (!context.actor.scopes.has(scope)) {
		throw new AccountCapabilityScopeError(scope);
	}
}
