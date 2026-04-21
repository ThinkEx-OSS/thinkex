"use client";

import { GlobeIcon, ChevronDownIcon } from "lucide-react";
import {
    useState,
    type FC,
    type PropsWithChildren,
} from "react";

import type { ChatToolUIProps } from "@/lib/chat/tool-ui-types";

import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { parseWebSearchResult } from "@/lib/ai/tool-result-schemas";
import type { WebSearchResult } from "@/lib/ai/web-search-shared";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import ShinyText from "@/components/ShinyText";

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
 * Inner component that handles result parsing inside the error boundary.
 */
const getDomain = (url: string) => {
    try {
        const domain = new URL(url).hostname;
        return domain.replace(/^www\./, '');
    } catch {
        return url;
    }
};

const WebSearchContent: FC<{
    status: { type: string };
    result: WebSearchResult | null;
}> = ({ status, result }) => {
    const isRunning = status.type === "running";
    const parsed = result ? parseWebSearchResult(result) : null;
    const metadata = parsed?.groundingMetadata;
    const queries = metadata?.webSearchQueries;
    const sources = parsed?.sources ?? [];

    return (
        <ToolRoot>
            <ToolTrigger
                active={isRunning}
                label="Searching Web"
                icon={<GlobeIcon className="size-4 shrink-0" />}
            />

            <ToolContent aria-busy={isRunning}>
                <ToolText>
                    <div className="space-y-4">
                        {/* 1. Show the inferred search queries used by the model */}
                        {queries && queries.length > 0 && (
                            <div>
                                <span className="text-xs font-medium text-muted-foreground/70 block mb-2">Search Queries:</span>
                                <div className="flex flex-wrap gap-2">
                                    {queries.map((q) => (
                                        <div key={q} className="bg-muted/50 px-2 py-1 rounded text-xs text-foreground/80 border border-border/50">
                                            {q}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {sources.length > 0 ? (
                            <div>
                                <span className="text-xs font-medium text-muted-foreground/70 block mb-2">Sources:</span>
                                <div className="flex flex-wrap gap-2">
                                    {sources.map((source) => {
                                        const uri = source.url;
                                        const title = source.title || getDomain(uri);
                                        return (
                                            <a
                                                key={uri || title}
                                                href={uri}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50 border border-border/50 hover:bg-muted/80 hover:border-border transition-colors group max-w-[200px]"
                                            >
                                                <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground/70" />

                                                <div className="font-medium text-[10px] text-foreground/90 truncate">
                                                    {title}
                                                </div>
                                            </a>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            // Fallback if no specific chunks but we have a result
                            !isRunning && parsed?.text && (
                                <div className="text-xs text-muted-foreground">
                                    Result processed internally.
                                </div>
                            )
                        )}

                        {isRunning && (
                            <div className="text-xs text-muted-foreground/60">Using internal search tool...</div>
                        )}
                    </div>
                </ToolText>
            </ToolContent>
        </ToolRoot>
    );
};

WebSearchContent.displayName = "WebSearchContent";

/**
 * Tool UI component for web_search tool.
 * Displays search query and results in a collapsible format similar to Reasoning.
 */
export const renderWebSearchToolUI: ChatToolUIProps<
  { query: string },
  WebSearchResult
>["render"] = ({
  status,
  result,
}) => {
  return (
    <ToolUIErrorBoundary componentName="WebSearch">
      <WebSearchContent status={status} result={result ?? null} />
    </ToolUIErrorBoundary>
  );
};
