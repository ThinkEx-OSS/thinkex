"use client";

import type { ComponentProps } from "react";
import { forwardRef } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const PromptInput = ({ className, ...props }: ComponentProps<"form">) => (
  <form
    className={cn(
      "relative flex w-full flex-col gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent px-3.5 pt-2 pb-1 shadow-[0_9px_9px_0px_rgba(0,0,0,0.01),0_2px_5px_0px_rgba(0,0,0,0.06)] dark:border-sidebar-border/15",
      className,
    )}
    {...props}
  />
);

export const PromptInputTextarea = forwardRef<
  HTMLTextAreaElement,
  ComponentProps<typeof Textarea>
>(({ className, ...props }, ref) => (
  <Textarea
    ref={ref}
    className={cn(
      "aui-composer-input max-h-32 w-full resize-none border-0 bg-transparent px-0 py-1.5 text-sm text-sidebar-foreground shadow-none outline-none placeholder:text-sidebar-foreground/60 focus-visible:outline-none focus-visible:ring-0",
      className,
    )}
    {...props}
  />
));

PromptInputTextarea.displayName = "PromptInputTextarea";

export const PromptInputFooter = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("flex items-center justify-between gap-2", className)} {...props} />
);

export const PromptInputActions = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("flex items-center gap-2", className)} {...props} />
);

export type PromptInputSubmitProps = ComponentProps<typeof Button> & {
  isLoading?: boolean;
};

export const PromptInputSubmit = ({
  className,
  children,
  disabled,
  isLoading,
  ...props
}: PromptInputSubmitProps) => (
  <Button className={cn("rounded-full", className)} disabled={disabled || isLoading} size="icon" type="submit" {...props}>
    {isLoading ? <Loader2Icon className="size-4 animate-spin" /> : children}
  </Button>
);
