import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { getAuthSessionQueryOptions } from "#/lib/session-query";

export const Route = createFileRoute("/_protected")({
	beforeLoad: async ({ context, location }) => {
		const session = await context.queryClient.ensureQueryData(getAuthSessionQueryOptions());

		if (!session) {
			throw redirect({
				to: "/login",
				search: {
					redirect: location.href,
				},
			});
		}

		return { session };
	},
	component: ProtectedLayout,
});

function ProtectedLayout() {
	return <Outlet />;
}
