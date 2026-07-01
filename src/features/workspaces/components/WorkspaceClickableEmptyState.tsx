import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

interface WorkspaceClickableEmptyStateProps {
	"aria-label": string;
	className?: string;
	description: ReactNode;
	media: ReactNode;
	onClick: () => void;
	surfaceClassName?: string;
	title: ReactNode;
}

export default function WorkspaceClickableEmptyState({
	"aria-label": ariaLabel,
	className,
	description,
	media,
	onClick,
	surfaceClassName,
	title,
}: WorkspaceClickableEmptyStateProps) {
	return (
		<button
			type="button"
			className={cn(
				"flex min-w-0 text-inherit outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
				className,
			)}
			aria-label={ariaLabel}
			onClick={onClick}
		>
			<span
				className={cn(
					"flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-12 text-center text-balance",
					surfaceClassName,
				)}
			>
				<span className="flex max-w-sm flex-col items-center gap-2">
					<span className="mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0">
						{media}
					</span>
					<span className="font-heading text-lg font-medium tracking-tight">{title}</span>
					<span className="text-muted-foreground text-sm/relaxed">{description}</span>
				</span>
			</span>
		</button>
	);
}
