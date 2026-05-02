"use client";

import { LinkIcon, ChevronDownIcon, CheckIcon, ExternalLinkIcon } from "lucide-react";
import {
  useState,
  type FC,
  type PropsWithChildren,
} from "react";

import type { ChatToolUIProps } from "@/lib/chat/tool-ui-types";

import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { parseURLContextResult } from "@/lib/ai/tool-result-schemas";
import { normalizeProcessUrlsArgs } from "@/lib/ai/process-urls-shared";
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
  className?: string;
}> = ({
  active,
  label,
  icon,
  className,
}) => (
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

/**
 * Tool UI component for web_fetch tool.
 * Displays URLs being processed and their retrieval status.
 */
type URLMetadata = {
  retrievedUrl?: string;
  urlRetrievalStatus?: string;
};

type ProcessUrlsResult =
  | string
  | {
    text: string;
    metadata?: {
      urlMetadata?: URLMetadata[] | null;
    };
  };

export const renderURLContextToolUI: ChatToolUIProps<{
  urls?: string[];
  jsonInput?: string;
}, ProcessUrlsResult>["render"] = ({ args, status, result }) => {
  const isRunning = status.type === "running";
  const isComplete = status.type === "complete";

  const parsedResult = result != null ? parseURLContextResult(result) : null;
  type Meta = {
    urlMetadata?: URLMetadata[];
  };
  const metadata = (typeof parsedResult === "object" && parsedResult !== null && "metadata" in parsedResult ? (parsedResult as { metadata?: Meta }).metadata : null) as Meta | null;
  const urlMetadata = metadata?.urlMetadata ?? null;

  const normalizedArgs = normalizeProcessUrlsArgs(args);
  const urls = normalizedArgs?.urls ?? [];

  const urlCount = urls.length;
  const successfulCount =
    urlMetadata?.filter((m) => m.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS").length ?? 0;
  const failedCount = (urlMetadata?.length ?? 0) - successfulCount;

  // Helper to get status badge color
  const getStatusColor = (status: string) => {
    if (status === "URL_RETRIEVAL_STATUS_SUCCESS")
      return "bg-green-500/10 text-green-600 border-green-500/20";
    if (status === "URL_RETRIEVAL_STATUS_FAILED")
      return "bg-red-500/10 text-red-600 border-red-500/20";
    if (status?.includes("ERROR"))
      return "bg-red-500/10 text-red-600 border-red-500/20";
    return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
  };

  // Helper to format status text
  const formatStatus = (status: string) => {
    return status
      .replace("URL_RETRIEVAL_STATUS_", "")
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <ToolUIErrorBoundary componentName="URLContext">
      <ToolRoot>
        <ToolTrigger
          active={isRunning}
          label={isRunning ? "Processing links" : "Links processed"}
          icon={<LinkIcon className="size-4 shrink-0" />}
        />

          <ToolContent aria-busy={isRunning}>
            <ToolText>
              <div className="space-y-3">
                {urlCount > 0 && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground/70">Links:</span>
                    <div className="mt-1 space-y-1">
                      {urls.map((url) => {
                        const urlMeta = urlMetadata?.find((m) => m.retrievedUrl === url);
                        return (
                          <div key={url} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <ExternalLinkIcon className="h-3 w-3 shrink-0 text-muted-foreground/60" />
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary hover:underline break-all"
                              >
                                {url.replace(/^https?:\/\//, "")}
                              </a>
                            </div>
                            {urlMeta && isComplete && urlMeta.urlRetrievalStatus && (
                              <div className="ml-5">
                                <Badge
                                  variant="outline"
                                  className={cn("text-[10px] px-1.5 py-0.5", getStatusColor(urlMeta.urlRetrievalStatus))}
                                >
                                  {formatStatus(urlMeta.urlRetrievalStatus)}
                                </Badge>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {isRunning && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                    <span className="text-xs text-foreground">
                      Processing {urlCount} link{urlCount !== 1 ? "s" : ""}...
                    </span>
                  </div>
                )}

                {isComplete && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckIcon className="h-4 w-4 text-green-500" />
                      <span className="text-xs text-foreground">
                        Processed {urlCount} link{urlCount !== 1 ? "s" : ""}
                      </span>
                    </div>

                    {metadata && urlMetadata && urlMetadata.length > 0 && (
                      <div className="border-t pt-2">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                          {successfulCount} loaded
                          {failedCount > 0 ? `, ${failedCount} unavailable` : ""}
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ToolText>
          </ToolContent>
      </ToolRoot>
    </ToolUIErrorBoundary>
  );
};
