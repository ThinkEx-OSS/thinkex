import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import AuthPageLayout from "#/components/AuthPageLayout";
import { Button } from "#/components/ui/button";
import { getMcpConsentContextFn } from "#/features/mcp/mcp-consent.functions";
import { mcpScopeDescriptions } from "#/features/mcp/mcp-config";
import { authClient } from "#/lib/auth-client";
import { buildPublicMeta } from "#/lib/seo";

const scopeLabels: Record<string, string> = {
	openid: "Identify your ThinkEx account",
	offline_access: "Stay connected until you revoke access",
	...mcpScopeDescriptions,
};

export const Route = createFileRoute("/oauth/consent")({
	validateSearch: z.object({
		client_id: z.string(),
		scope: z.string().optional(),
	}),
	loaderDeps: ({ search }) => ({ clientId: search.client_id }),
	loader: ({ deps }) => getMcpConsentContextFn({ data: deps }),
	head: () => ({
		meta: buildPublicMeta({
			title: "Connect to ThinkEx",
			description: "Review access before connecting an MCP client to your ThinkEx account.",
		}),
	}),
	component: OAuthConsentPage,
});

function OAuthConsentPage() {
	const { scope } = Route.useSearch();
	const { clientName, userEmail } = Route.useLoaderData();
	const [pendingDecision, setPendingDecision] = useState<"allow" | "deny" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const scopes = scope?.split(" ").filter(Boolean) ?? [];
	const hasRequestedScopes = scopes.length > 0;

	async function decide(accept: boolean) {
		setPendingDecision(accept ? "allow" : "deny");
		setError(null);

		if (accept && !hasRequestedScopes) {
			setError("This client did not specify any permissions.");
			setPendingDecision(null);
			return;
		}

		try {
			const result = await authClient.oauth2.consent({ accept, scope });

			if (result.error) {
				setError(result.error.message ?? "Unable to complete authorization.");
			} else if (result.data && "url" in result.data && typeof result.data.url === "string") {
				window.location.assign(result.data.url);
				return;
			} else {
				setError("The authorization server did not return a redirect.");
			}
		} catch {
			setError("Unable to complete authorization.");
		}

		setPendingDecision(null);
	}

	return (
		<AuthPageLayout>
			<section className="w-full space-y-7">
				<div className="space-y-2">
					<p className="text-sm font-medium text-muted-foreground">Connect an MCP client</p>
					<h1 className="text-2xl font-medium tracking-tight">Connect {clientName} to ThinkEx?</h1>
					{userEmail ? (
						<p className="text-sm leading-6 text-muted-foreground">
							Signed in as{" "}
							<span className="break-all font-medium text-foreground">{userEmail}</span>
						</p>
					) : null}
				</div>

				<div className="space-y-3 text-left">
					<p className="text-sm font-medium">This will allow {clientName} to:</p>
					<ul className="space-y-3 text-sm text-muted-foreground">
						{scopes.map((requestedScope) => (
							<li key={requestedScope} className="flex gap-3">
								<Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
								<span>{scopeLabels[requestedScope] ?? requestedScope}</span>
							</li>
						))}
					</ul>
				</div>
				{!hasRequestedScopes ? (
					<p className="text-sm text-destructive">
						This client did not specify any permissions. Cancel this request and reconnect.
					</p>
				) : null}

				<p className="text-left text-xs leading-5 text-muted-foreground">
					Your current role is checked again for every workspace operation. This connection cannot
					grant access to a workspace you cannot already use.
				</p>

				{error ? (
					<p className="text-sm text-destructive" role="alert">
						{error}
					</p>
				) : null}

				<div className="grid gap-3">
					<Button
						type="button"
						disabled={pendingDecision !== null || !hasRequestedScopes}
						className="w-full"
						onClick={() => void decide(true)}
					>
						{pendingDecision === "allow" ? <Loader2 className="animate-spin" /> : null}
						Allow access
					</Button>
					<Button
						type="button"
						variant="ghost"
						disabled={pendingDecision !== null}
						className="w-full"
						onClick={() => void decide(false)}
					>
						{pendingDecision === "deny" ? <Loader2 className="animate-spin" /> : null}
						Cancel
					</Button>
				</div>
			</section>
		</AuthPageLayout>
	);
}
