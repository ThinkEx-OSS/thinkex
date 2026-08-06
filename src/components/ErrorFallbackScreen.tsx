import type { ReactElement } from "react";

import ThinkExLogo from "#/components/ThinkExLogo";
import { Button } from "#/components/ui/button";

interface ErrorFallbackScreenProps {
	eyebrow?: string;
	title?: string;
	message: string;
	showRetry?: boolean;
	homeLink: ReactElement;
}

export default function ErrorFallbackScreen({
	eyebrow = "Unexpected error",
	title = "This page couldn't load",
	message,
	showRetry = false,
	homeLink,
}: ErrorFallbackScreenProps) {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<main className="flex min-h-screen items-center justify-center p-6 sm:p-10">
				<div className="flex w-full max-w-md flex-col items-center gap-8 px-8 text-center sm:px-12">
					<ThinkExLogo size={36} />
					<div className="space-y-3">
						<p className="text-xs font-medium uppercase tracking-[0.28em] text-muted-foreground">
							{eyebrow}
						</p>
						<h1 className="text-2xl font-medium tracking-tight">{title}</h1>
						<p className="text-sm leading-6 text-muted-foreground">{message}</p>
					</div>

					<div className="flex w-full max-w-xs flex-col gap-3">
						{showRetry ? (
							<Button type="button" onClick={() => window.location.reload()}>
								Try again
							</Button>
						) : null}
						<Button
							render={homeLink}
							variant={showRetry ? "ghost" : "default"}
							className={showRetry ? "text-muted-foreground hover:text-foreground" : undefined}
						>
							Go home
						</Button>
					</div>
				</div>
			</main>
		</div>
	);
}
