import { Crown } from "lucide-react";
import type * as React from "react";

import { useBillingState } from "#/features/account/use-billing-state";
import { cn } from "#/lib/utils.ts";

/**
 * Tips a crown onto an avatar. A wrapper rather than an AvatarBadge because
 * Avatar clips its children (overflow-hidden for the round image), and the
 * crown has to sit over the rim to read as a crown rather than a dot. z-10 so
 * it stays on top of the next avatar in an overlapping AvatarGroup.
 *
 * Gold on purpose, despite amber also backing --warning: a crown in any other
 * color stops being a crown, and it never appears next to a warning.
 */
export function Crowned({
	children,
	className,
	crowned,
	size = "default",
}: {
	children: React.ReactNode;
	className?: string;
	crowned: boolean;
	size?: "default" | "sm";
}) {
	return (
		<span className={cn("relative inline-flex shrink-0", className)}>
			{children}
			{crowned ? (
				<Crown
					aria-label="Pro"
					role="img"
					className={cn(
						"pointer-events-none absolute left-1/2 z-10 -translate-x-1/2 fill-amber-400 text-amber-600 drop-shadow-sm dark:fill-amber-300 dark:text-amber-500",
						size === "sm" ? "-top-2 size-2.5" : "-top-2.5 size-3.5",
					)}
				/>
			) : null}
		</span>
	);
}

/** The signed-in user's own avatar, crowned from their billing state. */
export function ProCrown({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	const { isPending, isPro } = useBillingState();

	return (
		<Crowned className={className} crowned={!isPending && isPro}>
			{children}
		</Crowned>
	);
}
