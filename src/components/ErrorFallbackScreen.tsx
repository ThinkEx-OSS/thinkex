import type { ReactElement } from "react";

import ThinkExLogo from "#/components/ThinkExLogo";
import { Button } from "#/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/components/ui/collapsible";

interface ErrorFallbackScreenProps {
	eyebrow?: string;
	title?: string;
	message: string;
	showRetry?: boolean;
	homeLink: ReactElement;
	stack?: string;
}

export default function ErrorFallbackScreen({
	eyebrow = "Unexpected error",
	title = "This page couldn't load",
	message,
	showRetry = false,
	homeLink,
	stack,
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

					{stack ? (
						<Collapsible className="flex w-full max-w-sm flex-col items-center text-center text-xs text-muted-foreground">
							<CollapsibleTrigger
								render={
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="mx-auto h-auto px-2 py-1 text-xs text-muted-foreground"
									/>
								}
							>
								Technical details
							</CollapsibleTrigger>
							<CollapsibleContent className="mt-3 w-full overflow-hidden">
								<pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-card p-4 text-left leading-5">
									{stack}
								</pre>
							</CollapsibleContent>
						</Collapsible>
					) : null}
				</div>
			</main>
		</div>
	);
}
