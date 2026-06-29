import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { getAuthSessionQueryOptions } from "#/lib/session-query";

export const Route = createFileRoute("/signup")({
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

		throw redirect({
			to: "/login",
			search: {
				redirect: search.redirect,
			},
		});
	},
	component: () => null,
});
