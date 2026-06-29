import { cn } from "#/lib/utils";

interface ThinkExLogoProps {
	/** Intrinsic pixel box. Omit when the mark should scale with adjacent type (via `cap`/`em`). */
	size?: number;
	className?: string;
	/** Hides mark from AT; use beside visible “ThinkEx” text so the wordmark is not duplicated. */
	presentation?: boolean;
}

export default function ThinkExLogo({ size, className, presentation = false }: ThinkExLogoProps) {
	const explicitPx = size != null;

	return (
		<span
			className={cn(
				"relative inline-flex shrink-0 items-center justify-center [&>img]:select-none",
				!explicitPx && "aspect-square size-[1.1cap]",
				className,
			)}
			style={explicitPx ? { width: size, height: size } : undefined}
			aria-hidden={presentation || undefined}
		>
			<img
				src="/newlogothinkex-light.svg"
				alt={presentation ? "" : "ThinkEx"}
				decoding="async"
				className={cn("absolute inset-0 h-full w-full object-contain dark:hidden")}
			/>
			<img
				src="/newlogothinkex-dark.svg"
				alt=""
				decoding="async"
				aria-hidden="true"
				className={cn("absolute inset-0 hidden h-full w-full object-contain dark:block")}
			/>
		</span>
	);
}
