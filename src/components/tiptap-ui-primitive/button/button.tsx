"use client"

import { forwardRef, Fragment, useMemo } from "react"

// --- UI ---
import { buttonVariants } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

// --- Lib ---
import { parseShortcutKeys } from "@/lib/tiptap-utils"
import { cn } from "@/lib/utils"

export type ButtonVariant = "ghost" | "primary"
export type ButtonSize = "small" | "default" | "large"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  showTooltip?: boolean
  tooltip?: React.ReactNode
  shortcutKeys?: string
  variant?: ButtonVariant
  size?: ButtonSize
}

export const ShortcutDisplay: React.FC<{ shortcuts: string[] }> = ({
  shortcuts,
}) => {
  if (shortcuts.length === 0) return null

  return (
    <div className="flex items-center gap-1">
      {shortcuts.map((key, index) => (
        <Fragment key={index}>
          {index > 0 && <kbd className="text-[10px] text-muted-foreground">+</kbd>}
          <kbd className="rounded border bg-background px-1 py-0.5 text-[10px] font-medium text-foreground">
            {key}
          </kbd>
        </Fragment>
      ))}
    </div>
  )
}

const variantMap: Record<ButtonVariant, "ghost" | "default"> = {
  ghost: "ghost",
  primary: "default",
}

const sizeMap: Record<ButtonSize, "sm" | "default"> = {
  small: "sm",
  default: "sm",
  large: "default",
}

const getButtonClassName = (
  variant: ButtonVariant = "ghost",
  size: ButtonSize = "default",
  className?: string
) =>
  cn(
    buttonVariants({
      variant: variantMap[variant],
      size: sizeMap[size],
    }),
    "tiptap-button h-8 gap-1.5 rounded-md px-2.5 text-sm shadow-none",
    "data-[active-state=on]:bg-accent data-[active-state=on]:text-accent-foreground",
    "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
    "data-[highlighted=true]:bg-accent data-[highlighted=true]:text-accent-foreground",
    "data-[focus-visible=true]:border-ring data-[focus-visible=true]:ring-ring/50 data-[focus-visible=true]:ring-[3px]",
    "data-[size=small]:h-7 data-[size=small]:px-2 data-[size=small]:text-xs",
    "data-[size=large]:h-9 data-[size=large]:px-3",
    "data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:size-4",
    "[&_.tiptap-button-icon-sub]:opacity-70 [&_.tiptap-button-dropdown-arrows]:opacity-70 [&_.tiptap-button-dropdown-small]:opacity-70",
    "[&_.tiptap-button-text]:truncate [&_.tiptap-button-text]:text-left",
    className
  )

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      children,
      tooltip,
      showTooltip = true,
      shortcutKeys,
      variant = "ghost",
      size = "default",
      ...props
    },
    ref
  ) => {
    const shortcuts = useMemo<string[]>(
      () => parseShortcutKeys({ shortcutKeys }),
      [shortcutKeys]
    )

    const button = (
      <button
        data-slot="tiptap-button"
        className={getButtonClassName(variant, size, className)}
        ref={ref}
        data-style={variant}
        data-size={size}
        {...props}
      >
        {children}
      </button>
    )

    if (!tooltip || !showTooltip) {
      return button
    }

    return (
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent sideOffset={8} className="flex items-center gap-2">
          <span>{tooltip}</span>
          <ShortcutDisplay shortcuts={shortcuts} />
        </TooltipContent>
      </Tooltip>
    )
  }
)

Button.displayName = "Button"

export default Button
