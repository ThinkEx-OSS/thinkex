"use client";

import { MessageSquare, FileText, Database } from "lucide-react";
import { getCardAccentColor } from "@/lib/workspace-state/colors";
import type { CardColor } from "@/lib/workspace-state/colors";

interface Approach {
    icon: React.ElementType;
    title: string;
    description: string;
    flaw: string;
}

const approaches: Approach[] = [
    {
        icon: MessageSquare,
        title: "Chat-First Tools",
        description: "ChatGPT, Gemini, Claude",
        flaw: "Insights vanish into endless scroll. Context resets every conversation.",
    },
    {
        icon: FileText,
        title: "Notes-First Tools",
        description: "Notion, Obsidian",
        flaw: "AI is bolted on. Your notes and the AI live in disconnected worlds.",
    },
    {
        icon: Database,
        title: "Document-First Tools",
        description: "NotebookLM",
        flaw: "Sources vanish behind the interface. You can't see or work with them.",
    },
];

export function TheProblem() {
    const borderColor = getCardAccentColor("#F59E0B" as CardColor, 0.2); // Amber border

    return (
        <section id="the-problem" className="py-16 md:py-20 px-4 sm:px-4 lg:px-6">
            <div
                className="mx-auto max-w-6xl relative bg-gray-900/40 dark:bg-gray-900/40 rounded-md p-6 md:p-10"
                style={{
                    border: `2px solid ${borderColor}`,
                }}
            >
                <div className="relative">
                    {/* Section Header */}
                    <div className="mb-8 md:mb-12">
                        <h2 className="text-3xl font-normal tracking-normal text-foreground sm:text-4xl md:text-5xl">
                            What Every Platform Gets Wrong
                        </h2>
                        <p className="mt-4 text-lg md:text-xl text-muted-foreground max-w-3xl">
                            Today&apos;s apps and AI split what should be a single, fluid process.
                        </p>
                    </div>

                    {/* Three Approaches Grid */}
                    <div className="grid gap-6 md:gap-8 md:grid-cols-3">
                        {approaches.map((approach) => {
                            const Icon = approach.icon;
                            return (
                                <div
                                    key={approach.title}
                                    className="relative p-6 md:p-8 rounded-md bg-background/50 border border-foreground/10 hover:border-foreground/20 transition-colors"
                                >
                                    <div className="flex items-start gap-4 mb-4">
                                        <div className="p-3 rounded-md bg-foreground/10 flex-shrink-0">
                                            <Icon className="h-6 w-6 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-medium text-foreground">
                                                {approach.title}
                                            </h3>
                                            <p className="text-sm text-muted-foreground mt-1">
                                                {approach.description}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-base text-muted-foreground leading-relaxed">
                                        {approach.flaw}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    {/* ThinkEx Differentiator */}
                    <div className="mt-10 md:mt-14 p-6 md:p-10 rounded-md bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20">
                        <h3 className="text-2xl md:text-3xl font-medium text-foreground mb-4">
                            ThinkEx is different
                        </h3>
                        <p className="text-lg md:text-xl text-muted-foreground max-w-3xl leading-relaxed">
                            Nothing disappears into a black box. You see what AI sees and control what it works with. And it&apos;s open source, so you get full transparency, no model lock-in, and a product driven by the community.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
