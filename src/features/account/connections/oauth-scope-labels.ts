export const OAUTH_SCOPE_LABELS: Record<string, string> = {
	"workspace:read": "Read your ThinkEx workspaces, files, and documents",
};

export function formatOAuthScopes(scopes: readonly string[]): string[] {
	return scopes.map((scope) => OAUTH_SCOPE_LABELS[scope] ?? scope);
}

export function parseOAuthScopeParam(scope: string | undefined): string[] {
	if (!scope) {
		return [];
	}

	return scope.split(/\s+/).filter(Boolean);
}
