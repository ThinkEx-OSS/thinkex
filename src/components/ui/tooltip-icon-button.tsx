"use client";

import { ComponentPropsWithRef, forwardRef, memo } from "react";
import { Slottable } from "@radix-ui/react-slot";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

const TooltipIconButtonImpl = forwardRef<
  HTMLButtonElement,
  TooltipIconButtonProps
>(({ children, tooltip, side = "bottom", className, ...rest }, ref) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          {...rest}
          className={cn("aui-button-icon size-6 p-1", className)}
          ref={ref}
        >
          <Slottable>{children}</Slottable>
          <span className="aui-sr-only sr-only">{tooltip}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>{tooltip}</TooltipContent>
    </Tooltip>
  );
});

TooltipIconButtonImpl.displayName = "TooltipIconButton";

// Memoize to prevent unnecessary re-renders when props haven't changed
export const TooltipIconButton = memo(TooltipIconButtonImpl, (prevProps, nextProps) => {
  // Compare all props that matter for rendering
  if (prevProps.tooltip !== nextProps.tooltip) return false;
  if (prevProps.side !== nextProps.side) return false;
  if (prevProps.className !== nextProps.className) return false;
  if (prevProps.disabled !== nextProps.disabled) return false;
  if (prevProps.onClick !== nextProps.onClick) return false;
  // Compare children (for icon changes)
  if (prevProps.children !== nextProps.children) return false;
  // All other props are spread to Button, so we check key props
  if (prevProps.variant !== nextProps.variant) return false;
  if (prevProps.size !== nextProps.size) return false;
  
  return true; // Props are equal, skip re-render
});
