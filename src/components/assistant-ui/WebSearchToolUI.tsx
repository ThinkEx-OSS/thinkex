"use client";

import { GlobeIcon, ChevronDownIcon } from "lucide-react";
import {
    useCallback,
    useRef,
    useState,
    type FC,
    type PropsWithChildren,
} from "react";

import {
    useScrollLock,
    makeAssistantToolUI,
} from "@assistant-ui/react";

import { StandaloneMarkdown } from "@/components/assistant-ui/standalone-markdown";
import { ToolUIErrorBoundary } from "@/components/tool-ui/shared";
import { parseStringResult } from "@/lib/ai/tool-result-schemas";
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
 * Root collapsible container that manages open/closed state and scroll lock.
 */
const ToolRoot: FC<
    PropsWithChildren<{
        className?: string;
    }>
> = ({ className, children }) => {
    const collapsibleRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const lockScroll = useScrollLock(collapsibleRef, ANIMATION_DURATION);

    const handleOpenChange = useCallback(
        (open: boolean) => {
            if (!open) {
                lockScroll();
            }
            setIsOpen(open);
        },
        [lockScroll],
    );

    return (
        <Collapsible
            ref={collapsibleRef}
            open={isOpen}
            onOpenChange={handleOpenChange}
            className={cn("aui-tool-root mb-4 w-full", className)}
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
            "aui-tool-fade pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16",
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
                "aui-tool-trigger group/trigger -mb-2 flex max-w-[75%] items-center gap-2 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
                className,
            )}
        >
            {icon}
            <span className="aui-tool-trigger-label-wrapper relative inline-block leading-none">
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
                    "aui-tool-trigger-chevron mt-0.5 size-4 shrink-0",
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
            "aui-tool-content relative overflow-hidden text-sm text-muted-foreground outline-none",
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
            "aui-tool-text relative z-0 space-y-4 pt-4 pl-6 leading-relaxed",
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
    } catch (e) {
        return url;
    }
};

const WebSearchContent: FC<{
    args: { query: string };
    status: { type: string };
    result: string | null;
}> = ({ args, status, result }) => {
    const isRunning = status.type === "running";
    // Parse result as JSON if available
    let parsed: any = null;
    try {
        if (result) {
            parsed = JSON.parse(result);
        }
    } catch (e) {
        // Fallback to simple string if parse fails (legacy support)
        parsed = { text: result };
    }

    const metadata = parsed?.groundingMetadata;
    const queries = metadata?.webSearchQueries as string[] | undefined;
    const chunks = metadata?.groundingChunks as any[] | undefined;

    return (
        <ToolRoot>
            <ToolTrigger
                active={isRunning}
                label="Searching Web"
                icon={<GlobeIcon className="aui-tool-trigger-icon size-4 shrink-0" />}
            />

            <ToolContent aria-busy={isRunning}>
                <ToolText>
                    <div className="space-y-4">
                        {/* 1. Show the inferred search queries used by the model */}
                        {queries && queries.length > 0 && (
                            <div>
                                <span className="text-xs font-medium text-muted-foreground/70 block mb-2">Search Queries:</span>
                                <div className="flex flex-wrap gap-2">
                                    {queries.map((q, i) => (
                                        <div key={i} className="bg-muted/50 px-2 py-1 rounded text-xs text-foreground/80 border border-border/50">
                                            {q}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 2. Show the sources found (Grounding Chunks) */}
                        {chunks && chunks.length > 0 ? (
                            <div>
                                <span className="text-xs font-medium text-muted-foreground/70 block mb-2">Sources:</span>
                                <div className="flex flex-wrap gap-2">
                                    {chunks.map((chunk, i) => {
                                        const uri = chunk.web?.uri || "";
                                        const title = chunk.web?.title || "Untitled Source";

                                        // Use title for favicon domain as requested, fallback to uri domain
                                        const faviconDomain = getDomain(title).includes('.') ? getDomain(title) : getDomain(uri);
                                        const faviconUrl = `https://www.google.com/s2/favicons?domain=${faviconDomain}&sz=32`;

                                        return (
                                            <a
                                                key={i}
                                                href={uri}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 px-2 py-1 rounded bg-muted/50 border border-border/50 hover:bg-muted/80 hover:border-border transition-colors group max-w-[200px]"
                                            >
                                                {/* Favicon */}
                                                <div className="relative size-3.5 shrink-0 overflow-hidden rounded-[2px]">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={faviconUrl}
                                                        alt=""
                                                        className="size-full object-cover"
                                                        onError={(e) => {
                                                            e.currentTarget.style.display = 'none';
                                                        }}
                                                    />
                                                </div>

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
 * Tool UI component for webSearch tool.
 * Displays search query and results in a collapsible format similar to Reasoning.
 */
export const WebSearchToolUI = makeAssistantToolUI<{
    query: string;
}, string>({
    toolName: "webSearch",
    render: function WebSearchToolUI({ args, status, result }) {
        return (
            <ToolUIErrorBoundary componentName="WebSearch">
                <WebSearchContent args={args} status={status} result={result ?? null} />
            </ToolUIErrorBoundary>
        );
    },
});
