import { createFileRoute, redirect } from "@tanstack/react-router";
import type { ReactNode } from "react";

import AuthPanel from "#/components/AuthPanel";
import ThinkExLogo from "#/components/ThinkExLogo";
import { workspaceRoleLabels } from "#/features/workspaces/contracts";
import {
	acceptWorkspaceInviteFn,
	getWorkspaceInvitePreviewFn,
} from "#/features/workspaces/invites/workspace-invite-functions";
import { buildInvitePath } from "#/lib/client-url";
import { buildPublicMeta } from "#/lib/seo";
import { getAuthSessionQueryOptions } from "#/lib/session-query";

export const Route = createFileRoute("/invite/$token")({
	loader: async ({ context, params }) => {
		const session = await context.queryClient.ensureQueryData(getAuthSessionQueryOptions());

		if (session) {
			// Signed-in visitors accept immediately — same UX as opening a share link while logged in.
			const result = await acceptWorkspaceInviteFn({
				data: { token: params.token },
			});

			throw redirect({
				to: "/workspaces/$workspaceId",
				params: { workspaceId: result.workspaceId },
				search: {
					tab: undefined,
					view: undefined,
				},
			});
		}

		try {
			return await getWorkspaceInvitePreviewFn({
				data: { token: params.token },
			});
		} catch {
			throw new Error("INVITE_UNAVAILABLE");
		}
	},
	head: ({ loaderData }) => ({
		meta: loaderData
			? buildPublicMeta({
					title: `Join ${loaderData.workspaceName}`,
					description: `${loaderData.inviterName} invited you to join ${loaderData.workspaceName} on ThinkEx.`,
					openGraphImageAlt: `Join ${loaderData.workspaceName} on ThinkEx`,
				})
			: buildPublicMeta({
					title: "Invite unavailable",
					description: "This ThinkEx invite link is invalid, expired, or has been revoked.",
				}),
	}),
	component: InviteLandingPage,
	errorComponent: InviteUnavailablePage,
});

function InviteScreen({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<main className="flex min-h-screen items-center justify-center p-6 sm:p-10">
				<div className="flex w-full max-w-md flex-col items-center gap-8 px-8 text-center sm:px-12">
					<ThinkExLogo size={36} />
					{children}
				</div>
			</main>
		</div>
	);
}

function InviteLandingPage() {
	const { token } = Route.useParams();
	const preview = Route.useLoaderData();
	const callbackURL = buildInvitePath(token);

	return (
		<InviteScreen>
			<div className="space-y-2">
				<h1 className="text-2xl font-medium tracking-tight">Join {preview.workspaceName}</h1>
				<p className="text-sm leading-6 text-muted-foreground">
					{preview.inviterName} invited you as{" "}
					<span className="font-medium text-foreground">{workspaceRoleLabels[preview.role]}</span>.
				</p>
			</div>
			<div className="w-full">
				<AuthPanel callbackURL={callbackURL} />
			</div>
		</InviteScreen>
	);
}

function InviteUnavailablePage() {
	return (
		<InviteScreen>
			<div className="space-y-2">
				<h1 className="text-2xl font-medium tracking-tight">Invite unavailable</h1>
				<p className="text-sm leading-6 text-muted-foreground">
					This invite link is invalid, expired, or has been revoked.
				</p>
			</div>
			<div className="w-full">
				<AuthPanel callbackURL="/home" />
			</div>
		</InviteScreen>
	);
}
