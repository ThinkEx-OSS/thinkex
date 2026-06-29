import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

/**
 * Spring used for contextual icon swaps. Per the interface-polish guidelines
 * these values are fixed: scale 0.25 → 1, opacity 0 → 1, blur 4px → 0, with a
 * spring that never bounces.
 */
const ICON_SWAP_TRANSITION = {
	type: "spring",
	duration: 0.3,
	bounce: 0,
} as const;

const ENTER = { opacity: 1, scale: 1, filter: "blur(0px)" };
const HIDDEN = { opacity: 0, scale: 0.25, filter: "blur(4px)" };

interface AnimatedIconSwapProps {
	/**
	 * Changing this value cross-fades from the current icon to the new
	 * `children`. Use the boolean/string that drives which icon renders
	 * (e.g. `copied`, `isActive`).
	 */
	swapKey: string | number | boolean;
	children: ReactNode;
	className?: string;
}

/**
 * Cross-fades between two contextual icons (copy → check, mail → check, etc.)
 * instead of hard-swapping them. Both states stack in a single grid cell so the
 * swap never shifts layout, and `initial={false}` keeps the mounted icon static
 * on first render — it only animates on subsequent state changes.
 */
export function AnimatedIconSwap({ swapKey, children, className }: AnimatedIconSwapProps) {
	return (
		<span className={cn("relative grid place-items-center *:[grid-area:1/1]", className)}>
			<AnimatePresence initial={false}>
				<motion.span
					key={String(swapKey)}
					className="inline-flex"
					initial={HIDDEN}
					animate={ENTER}
					exit={HIDDEN}
					transition={ICON_SWAP_TRANSITION}
				>
					{children}
				</motion.span>
			</AnimatePresence>
		</span>
	);
}
