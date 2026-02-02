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

/**
 * SourcesDisplay - Renders a compact "Sources" button with dropdown
 * Displays sources as a scrollable dropdown menu
 */
export function SourcesDisplay({ sources }: SourcesDisplayProps) {
    if (!sources || sources.length === 0) {
        return null;
    }

    return (
        <div className="w-fit">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        className="group flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-all duration-200 text-sm"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                    >
                        <ExternalLink className="h-3.5 w-3.5 text-white/50 group-hover:text-white/70" />
                        <span className="text-white/70 group-hover:text-white/90 font-medium">
                            {sources.length} {sources.length === 1 ? "source" : "sources"}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 text-white/40 group-hover:text-white/60" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    className="w-80 max-h-[400px] overflow-y-auto"
                    sideOffset={4}
                >
                    {sources.map((source, index) => {
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
                                    className="flex items-start gap-2 p-2 cursor-pointer"
                                >
                                    <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium line-clamp-2 mb-0.5">
                                            {source.title}
                                        </div>
                                        <div className="text-xs text-muted-foreground truncate">
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
