import { cn } from "#/lib/utils";

export const workspaceOverlayControlClassName =
	"pointer-events-auto absolute right-3 bottom-3 z-20";

export const workspaceOverlayPillClassName =
	"flex h-6 min-w-0 items-center rounded-full border border-border/60 bg-background/90 px-1.5 text-muted-foreground/80 text-xs shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/75";

export const workspaceOverlayPillFocusClassName =
	"has-focus-visible:border-border has-focus-visible:text-foreground";

export const workspaceOverlayPillSegmentClassName = "flex min-w-0 items-center gap-0.5";

export const workspaceOverlaySlashClassName = "text-muted-foreground/35";

export const workspaceOverlaySecondaryClassName = "min-w-3 text-muted-foreground/55 tabular-nums";

export const workspaceOverlayLabelClassName = "ml-1 text-muted-foreground/55";

export function workspaceOverlayPillClassNames(options?: { focusable?: boolean }) {
	return cn(
		workspaceOverlayPillClassName,
		options?.focusable && workspaceOverlayPillFocusClassName,
	);
}
