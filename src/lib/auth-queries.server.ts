import { withAuth } from "#/lib/auth.server";

export async function getSessionFromHeaders(headers: Headers) {
	return withAuth((auth) => auth.api.getSession({ headers }));
}

export async function getSessionFromRequest(request: Request) {
	return getSessionFromHeaders(new Headers(request.headers));
}
