import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

import { resetPostHogClientIdentity } from "#/integrations/posthog/provider";
import { authClient } from "#/lib/auth-client";
import { clearLocalAuthSession } from "#/lib/auth-sign-out";

export const Route = createFileRoute("/account-deleted")({
	head: () => ({
		meta: [
			{
				title: "ThinkEx | Account deleted",
			},
		],
	}),
	component: AccountDeletedPage,
});

function AccountDeletedPage() {
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const hasStartedTeardownRef = useRef(false);

	useEffect(() => {
		if (hasStartedTeardownRef.current) {
			return;
		}

		hasStartedTeardownRef.current = true;

		void (async () => {
			try {
				await authClient.signOut();
			} catch {
				// The account may already be deleted; clear local session regardless.
			}

			resetPostHogClientIdentity();
			await clearLocalAuthSession({
				queryClient,
				router,
				navigate,
				replace: true,
			});
		})();
	}, [navigate, queryClient, router]);

	return null;
}
