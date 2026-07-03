export interface AccessActor<TScope extends string> {
	scopes: ReadonlySet<TScope>;
	userId: string;
}

export interface ScopedAccessContext<TScope extends string> {
	actor: AccessActor<TScope>;
}

export class AccessScopeError<TScope extends string> extends Error {
	constructor(
		readonly domain: string,
		readonly scope: TScope,
	) {
		super(`Missing ${domain} access scope: ${scope}`);
		this.name = "AccessScopeError";
	}
}

export function createAccessActor<TScope extends string>(input: {
	scopes: readonly TScope[];
	userId: string;
}): AccessActor<TScope> {
	return {
		scopes: new Set(input.scopes),
		userId: input.userId,
	};
}

export function assertAccessScope<TScope extends string>(
	context: ScopedAccessContext<TScope>,
	domain: string,
	scope: TScope,
) {
	if (!context.actor.scopes.has(scope)) {
		throw new AccessScopeError(domain, scope);
	}
}
