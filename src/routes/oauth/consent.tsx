import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { buildPublicMeta } from "#/lib/seo";

const oauthConsentSearchSchema = z.object({
	client_id: z.string().optional(),
	scope: z.string().optional(),
	redirect_uri: z.string().optional(),
	state: z.string().optional(),
	response_type: z.string().optional(),
	code_challenge: z.string().optional(),
	code_challenge_method: z.string().optional(),
});

export const Route = createFileRoute("/oauth/consent")({
	validateSearch: oauthConsentSearchSchema,
	head: () => ({
		meta: buildPublicMeta({
			title: "Authorize Application",
			description: "Review and approve access for a connected application.",
		}),
	}),
	component: OAuthConsentPage,
});

function OAuthConsentPage() {
	const search = Route.useSearch();

	return (
		<main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-12">
			<div className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-tight">Authorize application</h1>
				<p className="text-muted-foreground text-sm">
					OAuth consent UI is not implemented yet. This stub route exists so the OAuth provider can
					redirect here during development.
				</p>
			</div>
			<pre className="bg-muted overflow-x-auto rounded-lg p-4 text-xs">
				{JSON.stringify(search, null, 2)}
			</pre>
		</main>
	);
}
