import { withAuth } from "#/lib/auth.server";

export async function getSessionFromHeaders(headers: Headers) {
	return withAuth((auth) => auth.api.getSession({ headers }));
}

export async function getSessionFromRequest(request: Request) {
	return getSessionFromHeaders(new Headers(request.headers));
}

export type AuthenticatedRequestUser = NonNullable<
	Awaited<ReturnType<typeof getSessionFromRequest>>
>["user"];

export async function getAuthenticatedRequestUser(
	request: Request,
): Promise<AuthenticatedRequestUser | null> {
	const session = await getSessionFromRequest(request);
	return session?.user ?? null;
}
