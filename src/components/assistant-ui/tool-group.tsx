"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FC,
  type PropsWithChildren,
} from "react";
import { ChevronDownIcon, LoaderIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { useAuiState, useScrollLock } from "@assistant-ui/react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

const ANIMATION_DURATION = 200;

const toolGroupVariants = cva("aui-tool-group-root group/tool-group w-full", {
  variants: {
    variant: {
      outline: "rounded-lg border px-3 py-2 mb-4",
      ghost: "",
      muted: "rounded-lg bg-muted/50 px-3 py-2 mb-4",
    },
  },
  defaultVariants: { variant: "outline" },
});

export type ToolGroupRootProps = Omit<
  React.ComponentProps<typeof Collapsible>,
  "open" | "onOpenChange"
> &
  VariantProps<typeof toolGroupVariants> & {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    defaultOpen?: boolean;
  };

function ToolGroupRoot({
  className,
  variant,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  defaultOpen = false,
  children,
  ...props
}: ToolGroupRootProps) {
  const collapsibleRef = useRef<HTMLDivElement>(null);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        lockScroll();
      }
      if (!isControlled) {
        setUncontrolledOpen(open);
      }
      controlledOnOpenChange?.(open);
    },
    [lockScroll, isControlled, controlledOnOpenChange],
  );

  return (
    <Collapsible
      ref={collapsibleRef}
      data-slot="tool-group-root"
      data-variant={variant ?? "outline"}
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={cn(
        toolGroupVariants({ variant }),
        "group/tool-group-root",
        className,
      )}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
        } as React.CSSProperties
      }
      {...props}
    >
      {children}
    </Collapsible>
  );
}

function ToolGroupTrigger({
  count,
  active = false,
  className,
  ...props
}: React.ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
  active?: boolean;
}) {
  const noun = count === 1 ? "action" : "actions";
  const label = active ? `Taking ${count} ${noun}` : `Took ${count} ${noun}`;

  return (
    <CollapsibleTrigger
      data-slot="tool-group-trigger"
      className={cn(
        "aui-tool-group-trigger group/trigger flex max-w-[75%] items-center gap-2 py-1 text-muted-foreground text-sm transition-colors hover:text-foreground cursor-pointer",
        className,
      )}
      {...props}
    >
      {active && (
        <LoaderIcon
          data-slot="tool-group-trigger-loader"
          className="aui-tool-group-trigger-loader size-4 shrink-0 animate-spin"
        />
      )}
      <span
        data-slot="tool-group-trigger-label"
        className="aui-tool-group-trigger-label-wrapper relative inline-block leading-none"
      >
        <span>{label}</span>
        {active && (
          <span
            aria-hidden
            data-slot="tool-group-trigger-shimmer"
            className="aui-tool-group-trigger-shimmer shimmer pointer-events-none absolute inset-0 motion-reduce:animate-none"
          >
            {label}
          </span>
        )}
      </span>
      <ChevronDownIcon
        data-slot="tool-group-trigger-chevron"
        className={cn(
          "aui-tool-group-trigger-chevron mt-0.5 size-4 shrink-0",
          "transition-transform duration-(--animation-duration) ease-out",
          "group-data-[state=closed]/trigger:-rotate-90",
          "group-data-[state=open]/trigger:rotate-0",
        )}
      />
    </CollapsibleTrigger>
  );
}

function ToolGroupContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CollapsibleContent>) {
  return (
    <CollapsibleContent
      data-slot="tool-group-content"
      className={cn(
        "aui-tool-group-content relative overflow-hidden text-muted-foreground text-sm outline-none",
        "group/collapsible-content ease-out",
        "data-[state=closed]:animate-collapsible-up",
        "data-[state=open]:animate-collapsible-down",
        "data-[state=closed]:fill-mode-forwards",
        "data-[state=closed]:pointer-events-none",
        "data-[state=open]:duration-(--animation-duration)",
        "data-[state=closed]:duration-(--animation-duration)",
        "pt-2",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">{children}</div>
    </CollapsibleContent>
  );
}

type ToolGroupComponent = FC<
  PropsWithChildren<{ startIndex: number; endIndex: number }>
> & {
  Root: typeof ToolGroupRoot;
  Trigger: typeof ToolGroupTrigger;
  Content: typeof ToolGroupContent;
};

const ToolGroupImpl: FC<
  PropsWithChildren<{ startIndex: number; endIndex: number }>
> = ({ children, startIndex, endIndex }) => {
  const toolCount = endIndex - startIndex + 1;

  // Match `ReasoningGroup` behavior: mark active while the *current streaming part*
  // is a tool-call within this group's index range.
  const isToolGroupStreaming = useAuiState(({ message }) => {
    if (message.status?.type !== "running") return false;
    const lastIndex = message.parts.length - 1;
    if (lastIndex < 0) return false;
    const lastType = message.parts[lastIndex]?.type;
    if (lastType !== "tool-call") return false;
    return lastIndex >= startIndex && lastIndex <= endIndex;
  });

  const isLastMessage = useAuiState(({ thread, message }) => {
    const messages = (thread as unknown as { messages?: Array<{ id?: string }> })?.messages;
    if (!messages || messages.length === 0) return false;
    return messages[messages.length - 1]?.id === message.id;
  });

  const [isManuallyOpen, setIsManuallyOpen] = useState(isLastMessage);
  const isOpen = isToolGroupStreaming || isManuallyOpen;

  // Only auto-collapse when this message is no longer the last one (newer messages below)
  useEffect(() => {
    if (!isLastMessage) {
      setIsManuallyOpen(false);
    }
  }, [isLastMessage]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (isToolGroupStreaming && !open) return;
      setIsManuallyOpen(open);
    },
    [isToolGroupStreaming],
  );

  // Only group when there are more than 1 consecutive tool call.
  // IMPORTANT: this check must stay *after* hooks to avoid conditional hook calls.
  if (toolCount <= 1) {
    return <>{children}</>;
  }

  return (
    <ToolGroupRoot variant="ghost" open={isOpen} onOpenChange={handleOpenChange}>
      <ToolGroupTrigger count={toolCount} active={isToolGroupStreaming} />
      <ToolGroupContent aria-busy={isToolGroupStreaming}>
        {children}
      </ToolGroupContent>
    </ToolGroupRoot>
  );
};

const ToolGroup = memo(ToolGroupImpl) as unknown as ToolGroupComponent;

ToolGroup.displayName = "ToolGroup";
ToolGroup.Root = ToolGroupRoot;
ToolGroup.Trigger = ToolGroupTrigger;
ToolGroup.Content = ToolGroupContent;

export {
  ToolGroup,
  ToolGroupRoot,
  ToolGroupTrigger,
  ToolGroupContent,
  toolGroupVariants,
};
