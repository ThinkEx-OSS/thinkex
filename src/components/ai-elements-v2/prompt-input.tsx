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
      "flex w-full flex-col gap-3 rounded-2xl border border-border/50 bg-background/95 p-3 shadow-sm backdrop-blur",
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
      "min-h-[80px] resize-none border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0",
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
