import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

export const getSession = createServerFn({ method: "GET" }).handler(async () => {
	const { getSessionFromHeaders } = await import("#/lib/auth-queries.server");

	return getSessionFromHeaders(getRequestHeaders());
});

export type AuthSession = Awaited<ReturnType<typeof getSession>>;
