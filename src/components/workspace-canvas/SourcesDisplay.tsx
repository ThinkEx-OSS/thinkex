"use client";

import type { Source } from "@/lib/workspace-state/types";
import { ExternalLink, ChevronDown } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SourcesDisplayProps {
    sources: Source[];
}

const PLACEHOLDER_SOURCE_URLS = new Set(
    [
        "https://github.com/thinkex/docs",
        "https://example.com/getting-started",
    ].map((url) => url.replace(/\/+$/, "").toLowerCase())
);

function isPlaceholderSourceUrl(url: string | undefined): boolean {
    if (!url) return false;
    const normalized = url.trim().replace(/\/+$/, "").toLowerCase();
    return PLACEHOLDER_SOURCE_URLS.has(normalized);
}

/**
 * SourcesDisplay - Renders a compact "Sources" button with dropdown
 * Displays sources as a scrollable dropdown menu
 */
export function SourcesDisplay({ sources }: SourcesDisplayProps) {
    const visibleSources = sources?.filter((source) => !isPlaceholderSourceUrl(source.url)) ?? [];

    if (visibleSources.length === 0) {
        return null;
    }

    return (
        <div className="w-fit">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        className="group flex items-center gap-1.5 px-2 py-1 rounded-md bg-foreground/5 hover:bg-foreground/10 border border-foreground/10 hover:border-foreground/20 transition-all duration-200 text-xs"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <ExternalLink className="h-3 w-3 text-foreground/50 group-hover:text-foreground/70" />
                        <span className="text-foreground/70 group-hover:text-foreground/90 font-medium">
                            {visibleSources.length} {visibleSources.length === 1 ? "source" : "sources"}
                        </span>
                        <ChevronDown className="h-3 w-3 text-foreground/40 group-hover:text-foreground/60" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    className="w-64 max-h-[300px] overflow-y-auto"
                    sideOffset={4}
                >
                    {visibleSources.map((source, index) => {
                        let hostname = "";
                        try {
                            hostname = new URL(source.url).hostname;
                        } catch {
                            hostname = source.url;
                        }

                        return (
                            <DropdownMenuItem key={index} asChild>
                                <a
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-start gap-1.5 p-1.5 cursor-pointer"
                                >
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-medium line-clamp-2 mb-0.5">
                                            {source.title}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground truncate">
                                            {hostname}
                                        </div>
                                    </div>
                                </a>
                            </DropdownMenuItem>
                        );
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}

export default SourcesDisplay;
