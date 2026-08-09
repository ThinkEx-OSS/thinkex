import { cn } from "#/lib/utils.ts";

/**
 * Diverges from shadcn's `bg-muted`, which is a fixed colour and so depends on
 * what it is placed over. On `--background` it is a heavy +6% step; on `--card`
 * it is invisible, because in dark mode `--muted` and `--card` are the same
 * `oklch(20.5% 0 0)`. Alpha over `--foreground` is surface-independent: it
 * lands ~3% off whatever is behind it, on either surface and in either theme.
 * Override the background only to stand in for a genuinely filled surface —
 * a message bubble, say. Never to re-tune contrast: that belongs here.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="skeleton"
			className={cn("animate-pulse rounded-md bg-foreground/4", className)}
			{...props}
		/>
	);
}

export { Skeleton };
