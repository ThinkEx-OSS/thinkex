import { cn } from "#/lib/utils.ts";

/** Foreground alpha keeps the placeholder visible across light and dark surfaces. */
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
