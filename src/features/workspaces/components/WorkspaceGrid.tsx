import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

// Shared responsive grid used by the home page, its empty state, and its loading
// skeleton so the three states stay visually identical and can't drift.
export function WorkspaceGrid({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={cn(
				"grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-2 xl:grid-cols-4",
				className,
			)}
		>
			{children}
		</section>
	);
}
