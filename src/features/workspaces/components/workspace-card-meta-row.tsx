import type { ReactNode } from "react";

interface WorkspaceCardMetaRowProps {
	leading?: ReactNode;
	trailing?: ReactNode | null;
}

export function WorkspaceCardMetaRow({ leading, trailing }: WorkspaceCardMetaRowProps) {
	const hasLeading = leading != null;
	const hasTrailing = trailing != null;

	if (!hasLeading && !hasTrailing) {
		return null;
	}

	return (
		<div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
			{hasLeading ? <div className="min-w-0 flex-1">{leading}</div> : null}
			{hasLeading && hasTrailing ? (
				<span aria-hidden="true" className="h-3 w-px shrink-0 bg-border/70" />
			) : null}
			{hasTrailing ? (
				<span className="shrink-0 whitespace-nowrap" suppressHydrationWarning>
					{trailing}
				</span>
			) : null}
		</div>
	);
}
