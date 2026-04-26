"use client";

import {
  MapIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  AlertCircle,
} from "lucide-react";
import { useState, type FC, type PropsWithChildren } from "react";

import type { ChatToolUIProps } from "@/lib/chat/tool-ui-types";

import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { parseWebMapResult } from "@/lib/ai/tool-result-schemas";
import {
  normalizeWebMapArgs,
  type WebMapLink,
  type WebMapOutput,
} from "@/lib/ai/web-map-shared";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import ShinyText from "@/components/ShinyText";
import { Badge } from "@/components/ui/badge";

const ANIMATION_DURATION = 200;
const SHIMMER_DURATION = 1000;

/**
 * Root collapsible container that manages open/closed state.
 */
const ToolRoot: FC<
  PropsWithChildren<{
    className?: string;
  }>
> = ({ className, children }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn("mb-4 w-full", className)}
      style={
        {
          "--animation-duration": `${ANIMATION_DURATION}ms`,
          "--shimmer-duration": `${SHIMMER_DURATION}ms`,
        } as React.CSSProperties
      }
    >
      {children}
    </Collapsible>
  );
};

ToolRoot.displayName = "ToolRoot";

/**
 * Gradient overlay that softens the bottom edge during expand/collapse animations.
 */
const GradientFade: FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn(
      "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16",
      "bg-[linear-gradient(to_top,var(--color-background),transparent)]",
      "animate-in fade-in-0",
      "group-data-[state=open]/collapsible-content:animate-out",
      "group-data-[state=open]/collapsible-content:fade-out-0",
      "group-data-[state=open]/collapsible-content:delay-[calc(var(--animation-duration)*0.75)]",
      "group-data-[state=open]/collapsible-content:fill-mode-forwards",
      "duration-(--animation-duration)",
      "group-data-[state=open]/collapsible-content:duration-(--animation-duration)",
      className,
    )}
  />
);

/**
 * Trigger button for the tool collapsible.
 */
const ToolTrigger: FC<{
  active: boolean;
  label: string;
  icon: React.ReactNode;
  badges?: React.ReactNode;
  className?: string;
}> = ({ active, label, icon, badges, className }) => (
  <CollapsibleTrigger
    className={cn(
      "group/trigger -mb-2 flex max-w-[75%] items-center gap-2 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
      className,
    )}
  >
    {icon}
    <span className="relative inline-block leading-none">
      {active ? (
        <ShinyText
          text={label}
          disabled={false}
          speed={1.5}
          className="text-sm"
        />
      ) : (
        <span>{label}</span>
      )}
    </span>
    {badges}
    <ChevronDownIcon
      className={cn(
        "mt-0.5 size-4 shrink-0",
        "transition-transform duration-(--animation-duration) ease-out",
        "group-data-[state=closed]/trigger:-rotate-90",
        "group-data-[state=open]/trigger:rotate-0",
      )}
    />
  </CollapsibleTrigger>
);

/**
 * Collapsible content wrapper that handles height expand/collapse animation.
 */
const ToolContent: FC<
  PropsWithChildren<{
    className?: string;
    "aria-busy"?: boolean;
  }>
> = ({ className, children, "aria-busy": ariaBusy }) => (
  <CollapsibleContent
    className={cn(
      "relative overflow-hidden text-sm text-muted-foreground outline-none",
      "group/collapsible-content ease-out",
      "data-[state=closed]:animate-collapsible-up",
      "data-[state=open]:animate-collapsible-down",
      "data-[state=closed]:fill-mode-forwards",
      "data-[state=closed]:pointer-events-none",
      "data-[state=open]:duration-(--animation-duration)",
      "data-[state=closed]:duration-(--animation-duration)",
      className,
    )}
    aria-busy={ariaBusy}
  >
    {children}
    <GradientFade />
  </CollapsibleContent>
);

ToolContent.displayName = "ToolContent";

/**
 * Text content wrapper that animates the tool text visibility.
 */
const ToolText: FC<
  PropsWithChildren<{
    className?: string;
  }>
> = ({ className, children }) => (
  <div
    className={cn(
      "relative z-0 space-y-4 pt-4 pl-6 leading-relaxed",
      "transform-gpu transition-[transform,opacity]",
      "group-data-[state=open]/collapsible-content:animate-in",
      "group-data-[state=closed]/collapsible-content:animate-out",
      "group-data-[state=open]/collapsible-content:fade-in-0",
      "group-data-[state=closed]/collapsible-content:fade-out-0",
      "group-data-[state=open]/collapsible-content:slide-in-from-top-4",
      "group-data-[state=closed]/collapsible-content:slide-out-to-top-4",
      "group-data-[state=open]/collapsible-content:duration-(--animation-duration)",
      "group-data-[state=closed]/collapsible-content:duration-(--animation-duration)",
      "[&_p]:-mb-2",
      className,
    )}
  >
    {children}
  </div>
);

ToolText.displayName = "ToolText";

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Tool UI component for web_map tool.
 * Displays the discovered URLs with optional title/description in a collapsible card.
 */
type WebMapArgs = {
  url?: string;
  search?: string;
  limit?: number;
  includeSubdomains?: boolean;
  sitemap?: "include" | "skip" | "only";
  jsonInput?: string;
};

export const renderWebMapToolUI: ChatToolUIProps<
  WebMapArgs,
  string | WebMapOutput
>["render"] = ({ args, status, result }) => {
  const isRunning = status.type === "running";
  const isComplete = status.type === "complete";

  const normalizedArgs = normalizeWebMapArgs(args);
  const sourceUrl = normalizedArgs?.url ?? "";

  const parsedResult = result != null ? parseWebMapResult(result) : null;
  const structured =
    parsedResult && typeof parsedResult === "object" ? parsedResult : null;
  const links: WebMapLink[] = structured?.links ?? [];
  const metadata = structured?.metadata;
  const errorMessage = metadata?.error ?? null;
  const truncated = metadata?.truncated ?? false;
  const total = metadata?.total ?? links.length;
  const fallbackText =
    typeof parsedResult === "string" ? parsedResult : (structured?.text ?? "");

  const domain = sourceUrl ? getDomain(sourceUrl) : "";
  const triggerLabel = isRunning
    ? sourceUrl
      ? `Mapping ${domain || sourceUrl}`
      : "Mapping site"
    : isComplete
      ? errorMessage
        ? "Map failed"
        : total > 0
          ? `Mapped ${total} URL${total !== 1 ? "s" : ""}`
          : "No URLs found"
      : "Map cancelled";

  const triggerBadges =
    isComplete && !errorMessage && total > 0 ? (
      <Badge
        variant="outline"
        className="text-[10px] px-1.5 py-0.5 max-w-[160px] truncate"
        title={domain || sourceUrl}
      >
        {domain || sourceUrl}
      </Badge>
    ) : null;

  return (
    <ToolUIErrorBoundary componentName="WebMap">
      <ToolRoot>
        <ToolTrigger
          active={isRunning}
          label={triggerLabel}
          icon={<MapIcon className="size-4 shrink-0" />}
          badges={triggerBadges}
        />

        <ToolContent aria-busy={isRunning}>
          <ToolText>
            <div className="space-y-3">
              {sourceUrl && (
                <div>
                  <span className="text-xs font-medium text-muted-foreground/70">
                    Source:
                  </span>{" "}
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline break-all"
                  >
                    {sourceUrl}
                  </a>
                </div>
              )}

              {isRunning && (
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                  <span className="text-xs text-foreground">
                    Discovering URLs...
                  </span>
                </div>
              )}

              {isComplete && errorMessage && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5">
                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                  <span className="text-xs text-destructive/90 break-words">
                    {errorMessage}
                  </span>
                </div>
              )}

              {isComplete && !errorMessage && links.length > 0 && (
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground/70">
                      URLs:
                    </span>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0.5"
                    >
                      {total} total{truncated ? " (truncated)" : ""}
                    </Badge>
                  </div>
                  <div className="mt-1 space-y-2">
                    {links.map((link) => (
                      <div key={link.url} className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <ExternalLinkIcon className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline break-all"
                          >
                            {link.url}
                          </a>
                        </div>
                        {link.title && (
                          <div className="ml-5 text-xs text-foreground/80 break-words">
                            {link.title}
                          </div>
                        )}
                        {link.description && (
                          <div className="ml-5 text-[11px] text-muted-foreground break-words">
                            {link.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {isComplete &&
                !errorMessage &&
                links.length === 0 &&
                fallbackText && (
                  <div className="text-xs text-muted-foreground break-words">
                    {fallbackText}
                  </div>
                )}

              {!isRunning && !isComplete && (
                <div className="text-xs text-muted-foreground">
                  Map cancelled.
                </div>
              )}
            </div>
          </ToolText>
        </ToolContent>
      </ToolRoot>
    </ToolUIErrorBoundary>
  );
};
