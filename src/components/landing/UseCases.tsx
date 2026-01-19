"use client";

import { BookOpen, FlaskConical, PenTool, LayoutTemplate, Folder, FileText, Sparkles, Table as TableIcon, Kanban, Youtube } from "lucide-react";
import { getCardAccentColor } from "@/lib/workspace-state/colors";
import type { CardColor } from "@/lib/workspace-state/colors";

interface UseCase {
    icon: React.ElementType;
    title: string;
    description: string;
    items: { type: string; label: string; color: string; size?: string }[];
}

const useCases: UseCase[] = [
    {
        icon: BookOpen,
        title: "Studying",
        description: "Stop switching between tabs. Keep your lecture slides, textbook PDF, and class notes open side-by-side while the AI quizzes you.",
        items: [
            { type: "pdf", label: "Lecture 1.pdf", color: "bg-red-500/10 text-red-500", size: "col-span-2" },
            { type: "ai", label: "Quiz", color: "bg-blue-500/10 text-blue-500", size: "col-span-1" },
            { type: "youtube", label: "Crash Course", color: "bg-red-600/10 text-red-600", size: "col-span-1" },
            { type: "note", label: "Class Notes", color: "bg-yellow-500/10 text-yellow-500", size: "col-span-2" },
        ]
    },
    {
        icon: FlaskConical,
        title: "Research",
        description: "Synthesize information from dozens of papers without losing track of your sources. Compare methodologies and results in one view.",
        items: [
            { type: "table", label: "Comparison Table", color: "bg-green-500/10 text-green-500", size: "col-span-2" },
            { type: "folder", label: "Sources", color: "bg-indigo-500/10 text-indigo-500", size: "col-span-1" },
            { type: "pdf", label: "Key Findings.pdf", color: "bg-red-500/10 text-red-500", size: "col-span-3" },
        ]
    },
    {
        icon: PenTool,
        title: "Writing & Content",
        description: "Draft your essay or article with your source material right there on the canvas. No more writer's block or lost citations.",
        items: [
            { type: "note", label: "Draft.md", color: "bg-yellow-500/10 text-yellow-500", size: "col-span-2 row-span-2 h-full" },
            { type: "pdf", label: "Reference", color: "bg-red-500/10 text-red-500", size: "col-span-1" },
            { type: "ai", label: "Editor", color: "bg-blue-500/10 text-blue-500", size: "col-span-1" },
        ]
    },
    {
        icon: LayoutTemplate,
        title: "Project Management",
        description: "Centralize your work. Keep requirements, research, and tasks side-by-side so you never lose context.",
        items: [
            { type: "pdf", label: "Specs.pdf", color: "bg-orange-500/10 text-orange-500", size: "col-span-1" },
            { type: "folder", label: "Assets", color: "bg-blue-500/10 text-blue-500", size: "col-span-1" },
            { type: "board", label: "Tasks", color: "bg-purple-500/10 text-purple-500", size: "col-span-1" },
            { type: "ai", label: "Sprint Plan", color: "bg-green-500/10 text-green-500", size: "col-span-3" },
        ]
    }
];

export function UseCases() {
    const borderColor = getCardAccentColor("#8B5CF6" as CardColor, 0.2); // Violet border

    return (
        <section id="use-cases" className="py-16 md:py-20 px-4 sm:px-4 lg:px-6">
            <div
                className="mx-auto max-w-6xl relative bg-gray-900/40 dark:bg-gray-900/40 rounded-md p-6 md:p-10"
                style={{
                    border: `2px solid ${borderColor}`,
                }}
            >
                <div className="relative">
                    <div className="mb-8 md:mb-12">
                        <h2 className="text-3xl font-normal tracking-normal text-foreground sm:text-4xl md:text-5xl">
                            Built for Real Impact
                        </h2>
                        <p className="mt-4 text-lg md:text-xl text-muted-foreground max-w-3xl">
                            See how ThinkEx organizes your information.
                        </p>
                    </div>

                    <div className="grid gap-6 md:gap-8 md:grid-cols-2">
                        {useCases.map((useCase) => {
                            const Icon = useCase.icon;
                            return (
                                <div
                                    key={useCase.title}
                                    className="relative p-6 md:p-8 rounded-md bg-background/50 border border-foreground/10 hover:border-foreground/20 transition-colors flex flex-col h-full"
                                >
                                    <div className="flex items-start gap-4 mb-4">
                                        <div className="p-2 rounded-md bg-foreground/10 flex-shrink-0">
                                            <Icon className="h-5 w-5 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-medium text-foreground">
                                                {useCase.title}
                                            </h3>
                                        </div>
                                    </div>
                                    <p className="text-base text-muted-foreground leading-relaxed mb-6 flex-grow">
                                        {useCase.description}
                                    </p>

                                    {/* Mini Workspace Visual (Bento) */}
                                    <div className="mt-auto bg-foreground/5 rounded-lg p-3 border border-foreground/10">

                                        <div className="grid grid-cols-3 gap-2">
                                            {useCase.items.map((item, idx) => {
                                                // Function to render visual content based on type
                                                const renderVisual = () => {
                                                    switch (item.type) {
                                                        case 'note':
                                                            return (
                                                                <div className="space-y-1.5 w-full opacity-50">
                                                                    <div className="h-1.5 w-3/4 bg-current rounded-full" />
                                                                    <div className="h-1.5 w-full bg-current rounded-full" />
                                                                    <div className="h-1.5 w-5/6 bg-current rounded-full" />
                                                                </div>
                                                            );
                                                        case 'table':
                                                            return (
                                                                <div className="grid grid-cols-2 gap-0.5 w-full opacity-50">
                                                                    <div className="h-2 bg-current rounded-sm" />
                                                                    <div className="h-2 bg-current rounded-sm" />
                                                                    <div className="h-2 bg-current rounded-sm" />
                                                                    <div className="h-2 bg-current rounded-sm" />
                                                                </div>
                                                            );
                                                        case 'board':
                                                            return <Kanban className="w-4 h-4 opacity-70" />;
                                                        case 'folder':
                                                            return <Folder className="w-4 h-4 opacity-70" />;
                                                        case 'pdf':
                                                            return <FileText className="w-4 h-4 opacity-70" />;
                                                        case 'ai':
                                                            return <Sparkles className="w-4 h-4 opacity-70" />;
                                                        case 'youtube':
                                                            return <Youtube className="w-4 h-4 opacity-70" />;
                                                        default:
                                                            return <div className="w-2 h-2 rounded-full bg-current opacity-70" />;
                                                    }
                                                };

                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`
                                                            flex flex-col justify-center gap-2 px-3 py-4 rounded-md border border-black/5 dark:border-white/5 
                                                            text-sm font-medium ${item.color} ${item.size || 'col-span-1'}
                                                            transition-transform hover:scale-[1.02] cursor-default overflow-hidden
                                                        `}
                                                    >
                                                        {renderVisual()}
                                                        <span className="opacity-90 truncate text-xs mt-1">{item.label}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </section>
    );
}
