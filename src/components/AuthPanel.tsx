import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";
import { signOutCurrentUser } from "#/lib/auth-sign-out";
import { getErrorMessage } from "#/lib/error-message";
import { getAuthSessionQueryOptions, refreshAuthSession } from "#/lib/session-query";

interface AuthPanelProps {
	callbackURL: string;
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 48 48"
			fill="currentColor"
			aria-hidden="true"
			{...props}
		>
			<title>Google</title>
			<path d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
			<path d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.91-2.24 5.38-4.74 7.04l7.73 6c4.51-4.18 7.05-10.33 7.05-17.51Z" />
			<path d="M10.53 28.59A14.46 14.46 0 0 1 9.75 24c0-1.59.28-3.14.78-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.86.93 7.5 2.56 10.78l7.97-6.19Z" />
			<path d="M24 48c6.48 0 11.93-2.13 15.92-5.94l-7.73-6c-2.15 1.45-4.92 2.3-8.19 2.3-6.26 0-11.57-4.22-13.47-9.77l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
		</svg>
	);
}

export default function AuthPanel({ callbackURL }: AuthPanelProps) {
	const navigate = useNavigate();
	const router = useRouter();
	const queryClient = useQueryClient();
	const { data: session } = useQuery(getAuthSessionQueryOptions());
	const [isLoading, setIsLoading] = useState(false);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const isAnonymousUser =
		session?.user && "isAnonymous" in session.user && Boolean(session.user.isAnonymous);

	if (session?.user) {
		return (
			<div className="flex flex-col gap-6" data-slot="auth-panel">
				<div className="space-y-4 text-center">
					<p className="text-sm leading-6 text-muted-foreground">
						{isAnonymousUser ? (
							<span>You&apos;re continuing as a guest.</span>
						) : (
							<>
								You&apos;re signed in as{" "}
								<span className="font-medium text-foreground">{session.user.email}</span>.
							</>
						)}
					</p>
					<div className="flex flex-wrap justify-center gap-3">
						<Button nativeButton={false} render={<Link to={callbackURL} />}>
							Continue
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => {
								void (async () => {
									try {
										await signOutCurrentUser({
											queryClient,
											router,
											navigate,
										});
									} catch (error) {
										toast.error(getErrorMessage(error, "Unable to sign out right now."));
									}
								})();
							}}
						>
							Sign out
						</Button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6" data-slot="auth-panel">
			<div className="mx-auto grid w-full max-w-xs gap-6">
				<Button
					type="button"
					onClick={() => {
						void (async () => {
							setIsLoading(true);
							setErrorMessage(null);

							try {
								await authClient.signIn.social({
									provider: "google",
									callbackURL,
								});
								await refreshAuthSession(queryClient);
								await router.invalidate();
							} catch (error) {
								setErrorMessage("Failed to sign in with Google");
								toast.error(getErrorMessage(error, "Failed to sign in with Google"));
								setIsLoading(false);
							}
						})();
					}}
					disabled={isLoading}
					className="w-full"
				>
					{isLoading ? (
						<Loader2 className="size-4 animate-spin" />
					) : (
						<GoogleIcon className="size-4" />
					)}
					Continue with Google
				</Button>
				{errorMessage ? (
					<p className="text-center text-xs text-destructive">{errorMessage}</p>
				) : null}
				<p className="text-center text-xs text-muted-foreground">
					No account? We&apos;ll create one.
				</p>
			</div>
		</div>
	);
}
