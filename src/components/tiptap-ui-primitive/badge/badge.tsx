"use client"

import { forwardRef } from "react"
import { Badge as ShadcnBadge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "ghost" | "white" | "gray" | "green" | "yellow" | "default"
  size?: "default" | "small"
  appearance?: "default" | "subdued" | "emphasized"
  trimText?: boolean
}

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  (
    {
      variant = "default",
      size = "default",
      className,
      children,
      ...props
    },
    ref
  ) => {
    const resolvedVariant =
      variant === "default"
        ? "secondary"
        : variant === "ghost"
          ? "outline"
          : variant === "gray"
            ? "outline"
            : "secondary"

    return (
      <ShadcnBadge
        ref={ref}
        variant={resolvedVariant}
        className={cn(
          "tiptap-badge rounded-md border px-1.5 py-0 text-[10px] font-medium shadow-none",
          size === "small" && "px-1 py-0 text-[9px]",
          className
        )}
        data-size={size}
        {...props}
      >
        {children}
      </ShadcnBadge>
    )
  }
)

Badge.displayName = "Badge"

export default Badge
