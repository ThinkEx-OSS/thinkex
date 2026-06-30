import type { KeyboardEvent, ReactNode } from "react";

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
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Enter" && event.key !== " ") {
			return;
		}

		event.preventDefault();
		onUploadFiles();
	};

	return (
		<div
			role="button"
			tabIndex={0}
			className={cn(
				"cursor-pointer rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
				className,
			)}
			aria-label={ariaLabel}
			onClick={onUploadFiles}
			onKeyDown={handleKeyDown}
		>
			{children}
		</div>
	);
}
