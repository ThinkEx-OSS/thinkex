import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

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
		<div
			className={cn(
				"flex items-center gap-2 text-xs text-muted-foreground",
				hasLeading ? "justify-between" : "justify-end",
			)}
		>
			{hasLeading ? <div className="min-w-0">{leading}</div> : null}
			{hasTrailing ? (
				<span className="shrink-0" suppressHydrationWarning>
					{trailing}
				</span>
			) : null}
		</div>
	);
}
