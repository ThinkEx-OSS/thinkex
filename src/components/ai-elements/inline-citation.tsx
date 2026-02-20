"use client";

import type { ComponentProps, ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type InlineCitationProps = ComponentProps<"span">;

export const InlineCitation = ({
  className,
  ...props
}: InlineCitationProps) => (
  <span
    className={cn("group inline-flex items-baseline gap-0.5 text-[0.7em]", className)}
    {...props}
  />
);

export type InlineCitationTextProps = ComponentProps<"span">;

export const InlineCitationText = ({
  className,
  ...props
}: InlineCitationTextProps) => (
  <span
    className={cn("transition-colors group-hover:bg-accent", className)}
    {...props}
  />
);

export type InlineCitationCardProps = ComponentProps<typeof Popover>;

export const InlineCitationCard = (props: InlineCitationCardProps) => (
  <Popover {...props} />
);

export type InlineCitationCardTriggerProps = ComponentProps<typeof Badge> & {
  sources: string[];
  /** Shown when sources is empty (e.g. during streaming) */
  fallbackLabel?: string;
};

function getBadgeLabel(sources: string[], fallbackLabel: string): ReactNode {
  if (!sources[0]) return fallbackLabel;
  try {
    const url = new URL(sources[0]);
    return (
      <>
        {url.hostname}{" "}
        {sources.length > 1 && `+${sources.length - 1}`}
      </>
    );
  } catch {
    return fallbackLabel;
  }
}

export const InlineCitationCardTrigger = ({
  sources,
  fallbackLabel = "unknown",
  className,
  ...props
}: InlineCitationCardTriggerProps) => (
  <PopoverTrigger asChild>
    <Badge
      className={cn("ml-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium cursor-pointer", className)}
      variant="secondary"
      {...props}
    >
      {getBadgeLabel(sources, fallbackLabel)}
    </Badge>
  </PopoverTrigger>
);

export type InlineCitationCardBodyProps = ComponentProps<"div">;

export const InlineCitationCardBody = ({
  className,
  ...props
}: InlineCitationCardBodyProps) => (
  <PopoverContent className={cn("relative w-80 p-0", className)} {...props} />
);

export type InlineCitationSourceProps = ComponentProps<"div"> & {
  title?: string;
  url?: string;
  /** When set (and no url), makes content clickable (e.g. open workspace note) */
  onClick?: () => void;
};

export const InlineCitationSource = ({
  title,
  url,
  onClick,
  className,
  children,
  ...props
}: InlineCitationSourceProps) => {
  const content = (
    <>
      {title && (
        <h4 className="truncate font-medium text-sm leading-tight">{title}</h4>
      )}
      {url && (
        <p className="truncate break-all text-muted-foreground text-xs">{url}</p>
      )}
      {children}
    </>
  );

  const clickable = url || onClick;
  const baseClasses = cn(
    "space-y-1 block w-full text-left min-h-0",
    clickable && "cursor-pointer transition-colors hover:bg-muted/50 rounded-md"
  );

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={cn(baseClasses, className)}
        {...(props as ComponentProps<"a">)}
      >
        {content}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(baseClasses, className)}
        {...props}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={cn(baseClasses, className)} {...props}>
      {content}
    </div>
  );
};

export type InlineCitationQuoteProps = ComponentProps<"blockquote">;

export const InlineCitationQuote = ({
  children,
  className,
  ...props
}: InlineCitationQuoteProps) => (
  <blockquote
    className={cn(
      "border-muted border-l-2 pl-3 text-muted-foreground text-sm italic",
      className
    )}
    {...props}
  >
    {children}
  </blockquote>
);
