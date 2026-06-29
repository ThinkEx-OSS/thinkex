import { createFileRoute } from "@tanstack/react-router";
import { withAuth } from "#/lib/auth.server";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: ({ request }) => withAuth((auth) => auth.handler(request)),
			POST: ({ request }) => withAuth((auth) => auth.handler(request)),
		},
	},
});
