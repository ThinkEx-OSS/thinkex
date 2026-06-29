import { type LucideIcon, X } from "lucide-react";
import type { Ref } from "react";

import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

export function WorkspaceTabShell({
	title,
	TabIcon,
	iconClassName,
	variant,
	buttonRef,
	isDragSource = false,
	showClose = false,
	closeLabel,
	onActivate,
	onClose,
}: {
	title: string;
	TabIcon: LucideIcon;
	iconClassName?: string;
	variant: "active-attached" | "active" | "idle";
	buttonRef?: Ref<HTMLButtonElement>;
	isDragSource?: boolean;
	showClose?: boolean;
	closeLabel?: string;
	onActivate?: () => void;
	onClose?: () => void;
}) {
	const isActive = variant === "active" || variant === "active-attached";

	return (
		<div
			className={cn(
				"group/tab flex min-w-0 flex-1 touch-none items-center border text-sm",
				variant === "active-attached" && "workspace-tab-active h-8 text-foreground",
				variant === "active" && "h-8 rounded-md border-transparent bg-background text-foreground",
				variant === "idle" &&
					"h-8 rounded-md border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
				isDragSource && "cursor-grabbing",
			)}
		>
			<button
				ref={buttonRef}
				type="button"
				className={cn(
					"flex h-full min-w-0 flex-1 touch-none items-center justify-start gap-1.5 bg-transparent py-0 pr-px pl-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
					isActive && "cursor-default",
					isDragSource && "cursor-grabbing",
				)}
				onClick={onActivate}
			>
				<TabIcon className={cn("size-3.5 shrink-0", iconClassName)} aria-hidden="true" />
				<span className="truncate">{title}</span>
			</button>
			{showClose && closeLabel && onClose ? (
				<Button
					type="button"
					variant="ghost"
					size="icon-xs"
					className={cn(
						"mr-1 size-4 shrink-0 rounded-sm text-muted-foreground opacity-0 transition-[opacity,background-color,color] hover:bg-accent hover:text-destructive focus-visible:opacity-100 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100",
						isActive && "opacity-100",
					)}
					aria-label={closeLabel}
					onClick={onClose}
				>
					<X className="size-3" aria-hidden="true" />
				</Button>
			) : null}
		</div>
	);
}
