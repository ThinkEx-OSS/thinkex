import { createFileRoute } from "@tanstack/react-router";

import { withAuth } from "#/lib/auth.server";

export const Route = createFileRoute("/.well-known/oauth-authorization-server")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const response = await withAuth((auth) => auth.handler(request));

				// Match the protected-resource metadata route so browser-based
				// discovery clients can read this cross-origin.
				const headers = new Headers(response.headers);
				headers.set("Access-Control-Allow-Origin", "*");

				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers,
				});
			},
		},
	},
});
