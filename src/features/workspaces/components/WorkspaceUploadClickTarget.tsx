import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

interface WorkspaceUploadClickTargetProps {
	"aria-label": string;
	children: ReactNode;
	className?: string;
	onUploadFiles: () => void;
}

export function WorkspaceUploadClickTarget({
	"aria-label": ariaLabel,
	children,
	className,
	onUploadFiles,
}: WorkspaceUploadClickTargetProps) {
	return (
		<div className={cn("relative rounded-lg", className)}>
			<button
				type="button"
				className="absolute inset-0 z-10 cursor-pointer rounded-lg bg-transparent p-0 text-left text-inherit outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				aria-label={ariaLabel}
				onClick={onUploadFiles}
			/>
			<div className="pointer-events-none relative z-0 flex min-h-0 flex-1">{children}</div>
		</div>
	);
}
