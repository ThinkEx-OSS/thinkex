import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import ThinkExLogo from "#/components/ThinkExLogo";
import { cn } from "#/lib/utils";

interface WorkspaceHeaderChromeProps {
	actions: ReactNode;
	actionsLabel: string;
	center?: ReactNode;
	contextBar: ReactNode;
	showWordmark?: boolean;
}

export default function WorkspaceHeaderChrome({
	actions,
	actionsLabel,
	center,
	contextBar,
	showWordmark = true,
}: WorkspaceHeaderChromeProps) {
	return (
		<header className="sticky top-0 z-40 bg-muted">
			<div className="flex h-14 w-full items-stretch justify-between gap-3 px-4 sm:h-12">
				<div className="flex min-w-0 flex-1 items-stretch gap-4">
					<WorkspaceHeaderBrandLink showWordmark={showWordmark} />
					{center}
				</div>
				<nav className="flex shrink-0 items-center gap-2" aria-label={actionsLabel}>
					{actions}
				</nav>
			</div>
			{contextBar}
		</header>
	);
}

function WorkspaceHeaderBrandLink({ showWordmark }: { showWordmark: boolean }) {
	return (
		<Link
			to="/home"
			preload="intent"
			className={cn(
				"flex shrink-0 items-center rounded-md text-foreground no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring",
				showWordmark && "gap-2.5",
			)}
			aria-label={showWordmark ? undefined : "Back to workspaces"}
		>
			<ThinkExLogo size={24} />
			{showWordmark ? (
				<span className="text-lg font-semibold tracking-tight sm:text-xl">ThinkEx</span>
			) : null}
		</Link>
	);
}
