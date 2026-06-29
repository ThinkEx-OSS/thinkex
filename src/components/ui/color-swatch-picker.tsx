import { CheckIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { cn } from "#/lib/utils";

export interface ColorSwatchPickerOption<Value extends string | null> {
	value: Value;
	label: string;
	swatchClassName: string;
	checkClassName?: string;
	swatchStyle?: CSSProperties;
}

interface ColorSwatchPickerProps<Value extends string | null> {
	value: Value | null;
	options: ReadonlyArray<ColorSwatchPickerOption<Value>>;
	onValueChange: (value: Value) => void;
	"aria-label": string;
	className?: string;
	disabled?: boolean;
	showLabels?: boolean;
}

export function ColorSwatchPicker<Value extends string | null>({
	value,
	options,
	onValueChange,
	className,
	disabled = false,
	showLabels = true,
	"aria-label": ariaLabel,
}: ColorSwatchPickerProps<Value>) {
	return (
		<fieldset
			aria-label={ariaLabel}
			className={cn("m-0 grid min-w-0 grid-cols-4 gap-2 border-0 p-0", className)}
		>
			{options.map((option) => {
				const selected = option.value === value;

				return (
					<button
						key={option.value ?? "default"}
						type="button"
						aria-pressed={selected}
						aria-label={showLabels ? undefined : option.label}
						disabled={disabled}
						className={cn(
							"flex items-center justify-center rounded-md text-xs outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
							showLabels
								? cn(
										"h-14 flex-col gap-1 border bg-background hover:bg-muted",
										selected
											? "border-ring bg-muted text-foreground"
											: "border-border text-muted-foreground",
									)
								: "size-8 p-0 hover:bg-muted/70",
						)}
						onClick={() => onValueChange(option.value)}
					>
						<span
							className={cn(
								"flex items-center justify-center",
								showLabels ? "size-4 rounded-full" : "size-6 rounded-[4px]",
								option.swatchClassName,
								selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
							)}
							style={option.swatchStyle}
							aria-hidden="true"
						>
							{selected ? (
								<CheckIcon className={cn("size-3 text-white drop-shadow", option.checkClassName)} />
							) : null}
						</span>
						{showLabels ? <span>{option.label}</span> : null}
					</button>
				);
			})}
		</fieldset>
	);
}
