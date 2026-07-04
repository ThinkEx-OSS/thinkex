import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import ThinkExLogo from "#/components/ThinkExLogo";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import {
	formatOAuthScopes,
	parseOAuthScopeParam,
} from "#/features/account/connections/oauth-scope-labels";
import { getOAuthClientPublic, submitOAuthConsent } from "#/features/account/connections/oauth-api";
import { getErrorMessage } from "#/lib/error-message";
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
	const navigate = useNavigate();
	const [pendingAction, setPendingAction] = useState<"allow" | "deny" | null>(null);
	const [completedAction, setCompletedAction] = useState<"allow" | "deny" | null>(null);
	const requestedScopes = parseOAuthScopeParam(search.scope);
	const scopeLabels = formatOAuthScopes(requestedScopes);

	const {
		data: client,
		isLoading: isClientLoading,
		isError: isClientError,
	} = useQuery({
		queryKey: ["oauth-client-public", search.client_id],
		enabled: Boolean(search.client_id),
		queryFn: () => getOAuthClientPublic(search.client_id!),
	});

	const handleConsent = async (accept: boolean) => {
		setPendingAction(accept ? "allow" : "deny");

		try {
			const result = await submitOAuthConsent({
				accept,
				scope: search.scope,
			});

			if (result.url) {
				setCompletedAction(accept ? "allow" : "deny");
				try {
					window.location.assign(result.url);
					return;
				} catch (error) {
					setCompletedAction(null);
					toast.error(
						getErrorMessage(error, "Unable to redirect after authorization. Please try again."),
					);
				}
			}

			toast.error("Authorization completed, but no redirect was returned.");
		} catch (error) {
			toast.error(getErrorMessage(error, "Unable to complete authorization right now."));
		} finally {
			setPendingAction(null);
		}
	};

	const clientName = client?.client_name ?? "Unknown application";
	const isPending = pendingAction !== null;

	return (
		<main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6 py-12">
			<div className="flex items-center gap-3">
				<ThinkExLogo size={32} />
				<span className="text-xl font-semibold tracking-tight">ThinkEx</span>
			</div>

			<div className="space-y-2">
				<h1 className="text-2xl font-semibold tracking-tight">Authorize application</h1>
				<p className="text-sm text-muted-foreground">
					Review the access requested by this application before continuing.
				</p>
			</div>

			{!search.client_id ? (
				<div className="space-y-3">
					<p className="text-sm text-destructive">
						This authorization request is missing a client identifier.
					</p>
					<Button
						type="button"
						variant="outline"
						onClick={() => {
							void navigate({ to: "/home" });
						}}
					>
						Return to ThinkEx
					</Button>
				</div>
			) : null}

			<section className="space-y-4 rounded-lg border bg-background p-4">
				<div className="space-y-1">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Application
					</p>
					{isClientLoading ? <Skeleton className="h-5 w-40" /> : null}
					{isClientError ? (
						<p className="text-sm text-destructive">Unable to load application details.</p>
					) : null}
					{!isClientLoading && !isClientError ? (
						<div className="flex items-center gap-3">
							{client?.logo_uri ? (
								<img
									src={client.logo_uri}
									alt=""
									className="size-10 rounded-md border object-cover"
								/>
							) : null}
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{clientName}</p>
								{client?.client_uri ? (
									<p className="truncate text-xs text-muted-foreground">{client.client_uri}</p>
								) : null}
							</div>
						</div>
					) : null}
				</div>

				{completedAction ? (
					<div className="space-y-3 border-t border-border pt-4">
						<p className="text-sm text-foreground">
							{completedAction === "allow"
								? `Authorization complete. Return to ${clientName} to continue. You can close this tab.`
								: "Access denied. You can close this tab."}
						</p>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								void navigate({ to: "/home" });
							}}
						>
							Return to ThinkEx
						</Button>
					</div>
				) : (
					<div className="space-y-2 border-t border-border pt-4">
						<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							Requested access
						</p>
						{scopeLabels.length > 0 ? (
							<ul className="space-y-2 text-sm">
								{scopeLabels.map((label) => (
									<li key={label} className="text-foreground">
										{label}
									</li>
								))}
							</ul>
						) : (
							<p className="text-sm text-muted-foreground">No scopes were requested.</p>
						)}
					</div>
				)}
			</section>

			{completedAction ? null : (
				<>
					<p className="text-sm text-muted-foreground">
						Allowing access lets this application read your ThinkEx workspaces on your behalf. You
						can revoke access anytime from Settings → Connections.
					</p>

					<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<Button
							type="button"
							variant="outline"
							disabled={isPending || !search.client_id}
							onClick={() => {
								void handleConsent(false);
							}}
						>
							{pendingAction === "deny" ? <Loader2 className="size-4 animate-spin" /> : null}
							Deny
						</Button>
						<Button
							type="button"
							disabled={isPending || !search.client_id || isClientLoading || isClientError}
							onClick={() => {
								void handleConsent(true);
							}}
						>
							{pendingAction === "allow" ? <Loader2 className="size-4 animate-spin" /> : null}
							Allow
						</Button>
					</div>
				</>
			)}
		</main>
	);
}
