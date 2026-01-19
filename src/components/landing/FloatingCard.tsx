"use client";

import { cn } from "@/lib/utils";
import { type CardColor, getCardAccentColor, getCardColorCSS } from "@/lib/workspace-state/colors";
import { Folder, CheckCircle2, MoreVertical, Play, X, Pencil, FolderInput, Palette, Trash2, ChevronLeft, ChevronRight, CheckSquare } from "lucide-react";
import Image from "next/image";

export type BackgroundCardType = 'folder' | 'flashcard' | 'note' | 'pdf' | 'youtube' | 'quiz';

export interface FloatingCardData {
    type: BackgroundCardType;
    title?: string;
    content?: string; // For notes/flashcards
    color?: CardColor;
    width?: string;
    height?: string;
    aspectRatio?: string;
    // rotation removed
    itemCount?: number; // For folders
    youtubeUrl?: string; // For YouTube cards
    thumbnailUrl?: string; // For YouTube cards (pre-calculated)
}

interface FloatingCardProps {
    data: FloatingCardData;
    className?: string;
}

export function FloatingCard({ data, className }: FloatingCardProps) {
    // Rotation removed forcefully
    // const rotationStyle = data.rotation ? { transform: `rotate(${data.rotation}deg)` } : {};
    const rotationStyle = {};

    // Base card styles using the color utilities
    const baseColor = data.color || '#3B82F6'; // Default blue
    const bodyBgColor = getCardColorCSS(baseColor, 0.4); // slightly more opaque than workspace for visibility
    const borderColor = getCardAccentColor(baseColor, 0.6);

    // Render specific card types
    if (data.type === 'folder') {
        return (
            <div
                className={cn("relative group mb-4 break-inside-avoid", className)}
                style={rotationStyle}
            >
                <div
                    className="relative w-full aspect-[1.3] rounded-md overflow-hidden select-none"
                    style={data.aspectRatio ? { aspectRatio: data.aspectRatio } : {}}
                >
                    {/* Folder Tab */}
                    <div
                        className="absolute top-0 left-0 h-[10%] w-[35%] rounded-t-md border border-b-0"
                        style={{
                            backgroundColor: getCardColorCSS(baseColor, 0.5),
                            borderColor: borderColor,
                            borderWidth: '1px',
                        }}
                    />

                    {/* Main Body */}
                    <div
                        className="absolute top-[10%] left-0 right-0 bottom-0 rounded-md rounded-tl-none border p-4 flex flex-col pt-[15%]"
                        style={{
                            backgroundColor: bodyBgColor,
                            borderColor: borderColor,
                            borderWidth: '1px',
                        }}
                    >
                        {/* Folder Content Mimic */}
                        <h3 className="text-white/50 font-medium text-sm md:text-base mb-1 truncate">{data.title || "New Folder"}</h3>
                        <p className="text-white/30 text-xs">{data.itemCount || 0} items</p>
                    </div>

                    {/* Decorative icons (non-interactive) */}
                    <div className="absolute top-3 right-3 opacity-50">
                        <MoreVertical className="w-4 h-4 text-white" />
                    </div>
                </div>
            </div>
        );
    }

    if (data.type === 'quiz') {
        return (
            <div
                className={cn("relative group mb-4 break-inside-avoid", className)}
                style={rotationStyle}
            >
                <div
                    className="w-full aspect-[1.2] rounded-md border p-4 flex flex-col overflow-hidden select-none bg-[#1C1C1C] shadow-sm"
                    style={{
                        borderColor: borderColor,
                    }}
                >
                    {/* Quiz Header */}
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/10">
                        <CheckSquare className="w-4 h-4" style={{ color: baseColor }} />
                        <h3 className="text-white/50 font-semibold text-xs md:text-sm truncate">{data.title || "Quiz"}</h3>
                    </div>

                    {/* Question */}
                    <p className="text-white/40 text-xs mb-3 line-clamp-2">
                        {data.content || "What is the correct answer?"}
                    </p>

                    {/* Answer Options */}
                    <div className="space-y-1.5 flex-1">
                        {['A', 'B', 'C', 'D'].map((option, i) => (
                            <div
                                key={option}
                                className={cn(
                                    "flex items-center gap-2 px-2 py-1 rounded text-[10px] md:text-xs",
                                    i === 1 ? "bg-green-500/20 border border-green-500/40" : "bg-white/5 border border-white/10"
                                )}
                            >
                                <span className={cn(
                                    "w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-medium",
                                    i === 1 ? "bg-green-500/30 text-green-400" : "bg-white/10 text-white/40"
                                )}>
                                    {option}
                                </span>
                                <span className={i === 1 ? "text-green-400/70" : "text-white/30"}>
                                    Option {option}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (data.type === 'flashcard') {
        const flashcardBg = data.color ? getCardColorCSS(data.color, 0.9) : '#1e1e1e'; // Higher opacity for flashcard front
        const textColor = data.color ? 'white' : 'white';

        return (
            <div
                className={cn("relative group mb-4 break-inside-avoid", className)}
                style={rotationStyle}
            >
                <div className="relative w-full aspect-[1.4] select-none">
                    {/* Stack Tabs - behind */}
                    <div
                        className="absolute left-[3%] right-[3%] bottom-[-4px] h-[10px] rounded-b-md z-0"
                        style={{ backgroundColor: getCardColorCSS(baseColor, 0.3) }}
                    />
                    <div
                        className="absolute left-[6%] right-[6%] bottom-[-8px] h-[10px] rounded-b-md z-[-1]"
                        style={{ backgroundColor: getCardColorCSS(baseColor, 0.15) }}
                    />

                    {/* Main Card */}
                    <div
                        className="absolute inset-0 rounded-md border flex items-center justify-center p-6 text-center shadow-sm"
                        style={{
                            backgroundColor: '#1e1e1e', // Dark background for flashcard mimics real app typically
                            borderColor: borderColor,
                        }}
                    >
                        <p className="text-white/50 font-medium text-sm md:text-base line-clamp-4 leading-relaxed">
                            {data.content || "Flashcard content goes here..."}
                        </p>
                    </div>

                    {/* Controls Mimic */}
                    <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-4 px-4">
                        <ChevronLeft className="w-4 h-4 text-white/30" />
                        <div className="px-2 py-0.5 rounded-full bg-black/20 text-white/50 text-[10px]">
                            1 / 5
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/30" />
                    </div>
                </div>
            </div>
        );
    }

    if (data.type === 'note') {
        return (
            <div
                className={cn("relative group mb-4 break-inside-avoid", className)}
                style={rotationStyle}
            >
                <div
                    className="w-full aspect-[0.8] rounded-md border p-4 flex flex-col overflow-hidden select-none bg-[#1e1e1e] shadow-sm"
                    style={{
                        borderColor: borderColor,
                        // backgroundColor: bodyBgColor // Notes usually have their own bg or use the color tint
                        backgroundColor: '#1C1C1C', // Dark note background
                        ...(data.aspectRatio ? { aspectRatio: data.aspectRatio } : {})
                    }}
                >
                    {/* Color strip at top if needed, or just border */}
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/10">
                        <h3 className="text-white/50 font-semibold text-xs md:text-sm truncate w-3/4">{data.title || "Untitled Note"}</h3>
                    </div>

                    {/* Content Lines */}
                    <div className="space-y-2 opacity-60">
                        <div className="h-2 w-full bg-white/20 rounded-sm" />
                        <div className="h-2 w-5/6 bg-white/20 rounded-sm" />
                        <div className="h-2 w-4/6 bg-white/20 rounded-sm" />
                        <div className="h-2 w-full bg-white/20 rounded-sm" />
                        {/* More fake text */}
                        <div className="h-2 w-3/4 bg-white/20 rounded-sm mt-4" />
                        <div className="h-2 w-1/2 bg-white/20 rounded-sm" />
                    </div>
                </div>
            </div>
        );
    }

    if (data.type === 'pdf') {
        return (
            <div
                className={cn("relative group mb-4 break-inside-avoid", className)}
                style={rotationStyle}
            >
                <div
                    className="w-full aspect-[0.75] rounded-md border p-0 flex flex-col overflow-hidden select-none bg-[#2A2A2A] shadow-sm"
                    style={{
                        borderColor: borderColor,
                        ...(data.aspectRatio ? { aspectRatio: data.aspectRatio } : {})
                    }}
                >
                    {/* Header */}
                    <div className="p-3 border-b border-white/10 bg-[#525659] flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-500/50" />
                        <h3 className="text-white/40 font-medium text-xs truncate flex-1">{data.title || "Document.pdf"}</h3>
                    </div>

                    {/* PDF Preview Mimic */}
                    <div className="flex-1 p-4 bg-[#525659] flex items-center justify-center relative">
                        <div className="w-full h-full bg-white/10 rounded-sm shadow-lg transform scale-95 origin-top backdrop-blur-sm p-2 flex flex-col gap-2">
                            <div className="w-3/4 h-2 bg-white/20 rounded-sm" />
                            <div className="w-full h-2 bg-white/10 rounded-sm" />
                            <div className="w-full h-2 bg-white/10 rounded-sm" />
                            <div className="w-5/6 h-2 bg-white/10 rounded-sm" />
                            <div className="w-full h-2 bg-white/10 rounded-sm mt-2" />
                            <div className="w-4/5 h-2 bg-white/10 rounded-sm" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (data.type === 'youtube') {
        return (
            <div
                className={cn("relative group mb-4 break-inside-avoid", className)}
                style={rotationStyle}
            >
                <div className="relative w-full aspect-video rounded-md overflow-hidden border border-white/10 shadow-sm select-none bg-black">
                    {data.thumbnailUrl ? (
                        <Image
                            src={data.thumbnailUrl}
                            alt="YouTube Thumbnail"
                            fill
                            className="object-cover opacity-80"
                            sizes="(max-width: 768px) 50vw, 33vw"
                        />
                    ) : (
                        <div className="w-full h-full bg-red-900/20 flex items-center justify-center">
                            <Play className="w-8 h-8 text-white/50" />
                        </div>
                    )}

                    {/* Overlay Play Button */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                            <Play className="w-5 h-5 text-white ml-0.5 fill-white" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
