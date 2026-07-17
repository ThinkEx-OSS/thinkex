import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { Button } from "#/components/ui/button";
import { mcpScopeDescriptions } from "#/features/mcp/mcp-config";
import { authClient } from "#/lib/auth-client";

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
	component: OAuthConsentPage,
});

function OAuthConsentPage() {
	const { client_id: clientId, scope } = Route.useSearch();
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
		<main className="grid min-h-svh place-items-center bg-background px-6 py-12">
			<section className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm">
				<div className="space-y-2">
					<p className="text-sm font-medium text-muted-foreground">Connect an MCP client</p>
					<h1 className="text-xl font-semibold tracking-tight">Allow access to ThinkEx?</h1>
					<p className="text-sm leading-6 text-muted-foreground">
						Client <span className="font-mono text-foreground">{clientId}</span> is requesting:
					</p>
				</div>

				<ul className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
					{scopes.map((requestedScope) => (
						<li key={requestedScope} className="flex gap-3">
							<span aria-hidden="true">•</span>
							<span>{scopeLabels[requestedScope] ?? requestedScope}</span>
						</li>
					))}
				</ul>
				{!hasRequestedScopes ? (
					<p className="text-sm text-destructive">
						This client did not specify any permissions. Deny this request and reconnect.
					</p>
				) : null}

				<p className="text-xs leading-5 text-muted-foreground">
					Your current role is checked again for every workspace operation. This connection cannot
					grant access to a workspace you cannot already use.
				</p>

				{error ? <p className="text-sm text-destructive">{error}</p> : null}

				<div className="flex justify-end gap-3">
					<Button
						type="button"
						variant="outline"
						disabled={pendingDecision !== null}
						onClick={() => void decide(false)}
					>
						{pendingDecision === "deny" ? <Loader2 className="animate-spin" /> : null}
						Deny
					</Button>
					<Button
						type="button"
						disabled={pendingDecision !== null || !hasRequestedScopes}
						onClick={() => void decide(true)}
					>
						{pendingDecision === "allow" ? <Loader2 className="animate-spin" /> : null}
						Allow
					</Button>
				</div>
			</section>
		</main>
	);
}
