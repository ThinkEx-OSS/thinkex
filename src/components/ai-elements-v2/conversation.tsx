"use client";

import type { ComponentProps } from "react";
import { useCallback } from "react";
import { ArrowDownIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConversationProps = ComponentProps<"div">;

export const Conversation = ({ className, ...props }: ConversationProps) => (
  <div className={cn("relative flex-1 overflow-y-auto", className)} role="log" {...props} />
);

export type ConversationContentProps = ComponentProps<"div">;

export const ConversationContent = ({ className, ...props }: ConversationContentProps) => (
  <div className={cn("flex flex-col gap-8 p-4", className)} {...props} />
);

export type ConversationEmptyStateProps = ComponentProps<"div"> & {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
};

export const ConversationEmptyState = ({
  className,
  title = "No messages yet",
  description = "Start a conversation to see messages here",
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      "flex size-full flex-col items-center justify-center gap-3 p-8 text-center",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
      </>
    )}
  </div>
);

export type ConversationScrollButtonProps = ComponentProps<typeof Button> & {
  onScrollToBottom?: () => void;
  visible?: boolean;
};

export const ConversationScrollButton = ({
  className,
  onScrollToBottom,
  visible = true,
  ...props
}: ConversationScrollButtonProps) => {
  const handleScrollToBottom = useCallback(() => {
    onScrollToBottom?.();
  }, [onScrollToBottom]);

  if (!visible) {
    return null;
  }

  return (
    <Button
      className={cn(
        "absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted",
        className,
      )}
      onClick={handleScrollToBottom}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  );
};
