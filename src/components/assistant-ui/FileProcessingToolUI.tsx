"use client";

import { FileIcon, ChevronDownIcon, CheckIcon, ExternalLinkIcon, AlertCircleIcon, FileTextIcon, VideoIcon, ImageIcon } from "lucide-react";
import {
    memo,
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
 * Helper function to get file type from URL
 */
function getFileType(url: string): { type: 'video' | 'pdf' | 'image' | 'document'; icon: React.ReactNode } {
    const urlLower = url.toLowerCase();

    if (url.match(/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/) || urlLower.match(/\.(mp4|mov|avi)$/)) {
        return { type: 'video', icon: <VideoIcon className="h-3 w-3" /> };
    }
    if (urlLower.endsWith('.pdf')) {
        return { type: 'pdf', icon: <FileTextIcon className="h-3 w-3" /> };
    }
    if (urlLower.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
        return { type: 'image', icon: <ImageIcon className="h-3 w-3" /> };
    }
    return { type: 'document', icon: <FileIcon className="h-3 w-3" /> };
}

/**
 * Tool UI component for processFiles tool.
 * Displays files being processed (Supabase storage files and YouTube videos).
 */
export const FileProcessingToolUI = makeAssistantToolUI<{
    jsonInput: string;
}, string>({
    toolName: "processFiles",
    render: function FileProcessingToolUI({ args, status, result }) {
        // Client-side debugging
        if (typeof window !== 'undefined') {
            console.debug("📁 [FILE_TOOL_UI] Component render:", {
                status: status.type,
                args: args,
                hasResult: !!result,
                timestamp: new Date().toISOString(),
            });
        }

        const isRunning = status.type === "running";
        const isComplete = status.type === "complete";

        // Parse args
        let urls: string[] = [];
        let instruction: string | undefined;

        if (args?.jsonInput) {
            try {
                const parsed = JSON.parse(args.jsonInput);
                urls = parsed.urls || [];
                instruction = parsed.instruction;
            } catch (e) {
                console.error("Failed to parse jsonInput:", e);
            }
        }

        const fileCount = urls.length;

        // Debug parsed data
        if (typeof window !== 'undefined') {
            console.debug("📁 [FILE_TOOL_UI] Parsed data:", {
                fileCount,
                urls,
                instruction,
                resultLength: result?.length || 0,
                isRunning,
                isComplete,
            });
        }

        return (
            <ToolRoot>
                <ToolTrigger
                    active={isRunning}
                    label={isRunning ? "Processing files" : "Files processed"}
                    icon={<FileIcon className="aui-tool-trigger-icon size-4 shrink-0" />}
                />

                <ToolContent aria-busy={isRunning}>
                    <ToolText>
                        <div className="space-y-3">
                            {fileCount > 0 && (
                                <div>
                                    <span className="text-xs font-medium text-muted-foreground/70">
                                        Files:
                                    </span>
                                    {instruction && (
                                        <div className="mt-1 mb-2 p-2 bg-muted/50 rounded-md border border-border/50">
                                            <div className="flex items-start gap-2">
                                                <AlertCircleIcon className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/60" />
                                                <div className="flex-1">
                                                    <span className="text-xs font-medium text-muted-foreground/70">Custom instruction:</span>
                                                    <p className="text-xs text-foreground mt-0.5">{instruction}</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div className="mt-1 space-y-1">
                                        {urls.map((url, index) => {
                                            const fileInfo = getFileType(url);
                                            const filename = url.split('/').pop() || url;
                                            return (
                                                <div key={index} className="flex items-center gap-2">
                                                    {fileInfo.icon}
                                                    <a
                                                        href={url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-primary hover:underline break-all"
                                                    >
                                                        {filename}
                                                    </a>
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0.5">
                                                        {fileInfo.type}
                                                    </Badge>
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
                                        Analyzing {fileCount} file{fileCount !== 1 ? 's' : ''}...
                                    </span>
                                </div>
                            )}

                            {isComplete && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <CheckIcon className="h-4 w-4 text-green-500" />
                                        <span className="text-xs text-foreground">
                                            Successfully processed {fileCount} file{fileCount !== 1 ? 's' : ''}
                                        </span>
                                    </div>

                                    {result && result.trim() && (
                                        <div className="border-t pt-2">
                                            <div className="prose prose-sm max-w-none dark:prose-invert">
                                                <StandaloneMarkdown>{result}</StandaloneMarkdown>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </ToolText>
                </ToolContent>
            </ToolRoot>
        );
    },
});
