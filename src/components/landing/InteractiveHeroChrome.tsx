import { Check, X, type LucideIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "#/lib/utils";

const buttonBase =
	"inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50";

export function DemoToolbarGroup({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("flex items-center gap-1 sm:gap-0.5", className)} {...props} />;
}

export function DemoToolbarIconButton({
	className,
	type = "button",
	...props
}: ComponentProps<"button">) {
	return (
		<button
			type={type}
			className={cn(
				buttonBase,
				"size-10 px-0 text-muted-foreground hover:bg-accent hover:text-foreground sm:size-8.5 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		/>
	);
}

export function DemoToolbarTextButton({
	className,
	type = "button",
	...props
}: ComponentProps<"button">) {
	return (
		<button
			type={type}
			className={cn(
				buttonBase,
				"h-10 gap-1.5 px-3 text-muted-foreground hover:bg-accent hover:text-foreground sm:h-8.5 sm:px-2.5 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		/>
	);
}

export function DemoTabDivider({
	className,
	visible = true,
}: {
	className?: string;
	visible?: boolean;
}) {
	return (
		<div
			aria-hidden="true"
			className={cn(
				"relative z-10 h-4 w-px shrink-0 bg-border/70",
				!visible && "opacity-0",
				className,
			)}
		/>
	);
}

export function DemoTabShell({
	title,
	TabIcon,
	iconClassName,
	active,
	showClose,
	onActivate,
	onClose,
}: {
	title: string;
	TabIcon: LucideIcon;
	iconClassName?: string;
	active: boolean;
	showClose: boolean;
	onActivate: () => void;
	onClose: () => void;
}) {
	return (
		<div
			className={cn(
				"group/tab flex h-8 min-w-0 flex-1 items-center border text-sm",
				active
					? "workspace-tab-active text-foreground"
					: "rounded-md border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
			)}
		>
			<button
				type="button"
				className="flex h-full min-w-0 flex-1 items-center justify-start gap-1.5 bg-transparent py-0 pr-px pl-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
				onClick={onActivate}
			>
				<TabIcon className={cn("size-3.5 shrink-0", iconClassName)} aria-hidden="true" />
				<span className="truncate">{title}</span>
			</button>
			{showClose ? (
				<button
					type="button"
					aria-label={`Close ${title}`}
					onClick={onClose}
					className={cn(
						buttonBase,
						"mr-1 size-4 rounded-sm text-muted-foreground opacity-0 hover:bg-accent hover:text-destructive focus-visible:opacity-100 group-focus-within/tab:opacity-100 group-hover/tab:opacity-100",
						active && "opacity-100",
					)}
				>
					<X className="size-3" aria-hidden="true" />
				</button>
			) : null}
		</div>
	);
}

export function DemoSelectionButton({
	itemName,
	selected,
	onClick,
}: {
	itemName: string;
	selected: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			aria-label={`${selected ? "Remove" : "Add"} ${itemName} ${selected ? "from" : "to"} AI context`}
			aria-pressed={selected}
			onClick={(event) => {
				event.stopPropagation();
				onClick();
			}}
			className={cn(
				buttonBase,
				"pointer-events-auto relative z-20 size-6 rounded-sm border border-border/80 bg-card/95 text-muted-foreground backdrop-blur-md sm:pointer-events-none sm:opacity-0 sm:group-hover/item:pointer-events-auto sm:group-hover/item:opacity-100 sm:group-focus-within/item:pointer-events-auto sm:group-focus-within/item:opacity-100",
				selected && "border-info bg-info text-white opacity-100 sm:pointer-events-auto",
			)}
		>
			<Check
				className={cn(
					"size-3.5 transition-opacity",
					selected ? "opacity-100" : "opacity-0 group-hover:opacity-55",
				)}
				aria-hidden="true"
			/>
		</button>
	);
}

export type DemoProgressTone = "correct" | "missed" | "unseen";

export function DemoProgressStrip({
	ariaLabel,
	currentIndex,
	segments,
}: {
	ariaLabel: string;
	currentIndex: number;
	segments: readonly { id: string; label: string; tone: DemoProgressTone }[];
}) {
	return (
		<div
			role="group"
			aria-label={ariaLabel}
			className="mx-auto grid h-4 w-full items-center gap-[3px]"
			style={{ gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))` }}
		>
			{segments.map((segment, index) => (
				<div key={segment.id} aria-label={segment.label} className="flex h-4 min-w-0 items-center">
					<span
						aria-hidden="true"
						className={cn(
							"h-1.5 w-full min-w-0 rounded-full bg-border",
							segment.tone === "missed" && "bg-red-500/75",
							segment.tone === "correct" && "bg-emerald-500/75",
							index === currentIndex &&
								"h-2.5 ring-1 ring-foreground/70 ring-offset-1 ring-offset-background",
						)}
					/>
				</div>
			))}
		</div>
	);
}
