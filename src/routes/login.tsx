import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import AuthScreen from "#/components/AuthScreen";
import { buildPublicMeta } from "#/lib/seo";
import { getAuthSessionQueryOptions } from "#/lib/session-query";

export const Route = createFileRoute("/login")({
	validateSearch: z.object({
		redirect: z
			.string()
			.refine((value) => value.startsWith("/") && !value.startsWith("//"))
			.optional(),
	}),
	beforeLoad: async ({ context, search }) => {
		const session = await context.queryClient.ensureQueryData(getAuthSessionQueryOptions());

		if (session) {
			throw redirect({ to: search.redirect || "/home" });
		}
	},
	head: () => ({
		meta: buildPublicMeta({
			title: "Continue",
			description: "Continue to ThinkEx with Google. No account? We'll create one.",
		}),
	}),
	component: LoginPage,
});

function LoginPage() {
	const { redirect: redirectTarget } = Route.useSearch();
	const callbackURL = redirectTarget || "/home";

	return <AuthScreen callbackURL={callbackURL} />;
}
