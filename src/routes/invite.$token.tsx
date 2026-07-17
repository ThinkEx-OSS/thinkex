import { createFileRoute, redirect } from "@tanstack/react-router";

import AuthPanel from "#/components/AuthPanel";
import AuthPageLayout from "#/components/AuthPageLayout";
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
			if (result.status === "unavailable") {
				return result;
			}

			throw redirect({
				to: "/workspaces/$workspaceId",
				params: { workspaceId: result.value.workspaceId },
				search: {
					tab: undefined,
					view: undefined,
				},
			});
		}

		return await getWorkspaceInvitePreviewFn({
			data: { token: params.token },
		});
	},
	head: ({ loaderData }) => ({
		meta:
			loaderData?.status === "ready"
				? buildPublicMeta({
						title: `Join ${loaderData.value.workspaceName}`,
						description: `${loaderData.value.inviterName} invited you to join ${loaderData.value.workspaceName} on ThinkEx.`,
						openGraphImageAlt: `Join ${loaderData.value.workspaceName} on ThinkEx`,
					})
				: buildPublicMeta({
						title: "Invite unavailable",
						description: "This ThinkEx invite link is invalid, expired, or has been revoked.",
					}),
	}),
	component: InviteRoutePage,
});

function InviteRoutePage() {
	const { token } = Route.useParams();
	const result = Route.useLoaderData();
	if (result.status === "unavailable") {
		return <InviteUnavailablePage />;
	}

	const preview = result.value;
	const callbackURL = buildInvitePath(token);

	return (
		<AuthPageLayout>
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
		</AuthPageLayout>
	);
}

function InviteUnavailablePage() {
	return (
		<AuthPageLayout>
			<div className="space-y-2">
				<h1 className="text-2xl font-medium tracking-tight">Invite unavailable</h1>
				<p className="text-sm leading-6 text-muted-foreground">
					This invite link is invalid, expired, or has been revoked.
				</p>
			</div>
			<div className="w-full">
				<AuthPanel callbackURL="/home" />
			</div>
		</AuthPageLayout>
	);
}
