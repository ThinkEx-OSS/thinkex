import { createFileRoute, redirect } from "@tanstack/react-router";

import LandingPage from "#/components/LandingPage";
import { buildPublicMeta } from "#/lib/seo";
import { getAuthSessionQueryOptions } from "#/lib/session-query";

export const Route = createFileRoute("/")({
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(getAuthSessionQueryOptions());

		if (session) {
			throw redirect({ to: "/home" });
		}
	},
	head: () => ({
		meta: buildPublicMeta(),
	}),
	component: LandingPage,
});
