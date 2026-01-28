"use client";

import { useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { FloatingCard, type FloatingCardData } from "./FloatingCard";
import { type CardColor } from "@/lib/workspace-state/colors";
import { cn } from "@/lib/utils";

// Base cards for landing page
const BASE_CARDS: FloatingCardData[] = [
    // Column 1ish
    { type: 'note', title: 'Product Vision 2025', color: '#3B82F6' },
    { type: 'note', title: 'Tech Stack Decision Log', color: '#E11D48' },
    { type: 'flashcard', content: 'What is the primary function of the hippocampus?', color: '#EF4444' },
    { type: 'folder', title: 'Research Papers', itemCount: 12, color: '#10B981' },

    // Column 2ish
    { type: 'pdf', title: 'Q4 Financial Report.pdf', color: '#F59E0B', aspectRatio: '1/1.1' },
    { type: 'note', title: 'Meeting Notes: Design Sync', color: '#8B5CF6' },
    { type: 'flashcard', content: 'Define "Neuroplasticity"', color: '#EC4899' },
    { type: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=P6FORpg0KVo', thumbnailUrl: 'https://img.youtube.com/vi/P6FORpg0KVo/sddefault.jpg' }, // Lofi girl or similar placeholder

    // Column 3ish
    { type: 'folder', title: 'Project Assets', itemCount: 48, color: '#06B6D4' },
    { type: 'note', title: 'Ideas for Marketing', color: '#F97316' },
    { type: 'quiz', title: 'Neuroscience Quiz', content: 'Which brain region processes memory?', color: '#8B5CF6' },
    { type: 'folder', title: 'Cognitive Science', itemCount: 24, color: '#14B8A6' },

    // Column 4ish
    { type: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=WUvTyaaNkzM', thumbnailUrl: 'https://img.youtube.com/vi/WUvTyaaNkzM/sddefault.jpg' },
    { type: 'folder', title: 'Archive 2024', itemCount: 156, color: '#64748B' },
    { type: 'pdf', title: 'User_Interview_Script_v2.pdf', color: '#6366F1' },
    { type: 'folder', title: 'Neurology Resources', itemCount: 18, color: '#8B5CF6' },
];

// Additional cards for home route only
const EXTRA_CARDS: FloatingCardData[] = [
    { type: 'note', title: 'Learning Path: React', color: '#0EA5E9' },
    { type: 'flashcard', content: 'What is the difference between let and const?', color: '#3B82F6' },
    { type: 'folder', title: 'Code Snippets', itemCount: 32, color: '#10B981' },
    { type: 'pdf', title: 'API_Documentation.pdf', color: '#F59E0B', aspectRatio: '1/1.2' },
    { type: 'quiz', title: 'JavaScript Basics', content: 'What is a closure?', color: '#8B5CF6' },
    { type: 'note', title: 'Project Roadmap Q1', color: '#EC4899' },
    { type: 'folder', title: 'Design System', itemCount: 67, color: '#14B8A6' },
    { type: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=aXRTczANuIs', thumbnailUrl: 'https://img.youtube.com/vi/aXRTczANuIs/sddefault.jpg' },
    { type: 'flashcard', content: 'Explain the concept of recursion', color: '#EF4444' },
    { type: 'note', title: 'Team Meeting Notes', color: '#F97316' },
    { type: 'pdf', title: 'System_Architecture.pdf', color: '#6366F1', aspectRatio: '1/1.1' },
    { type: 'folder', title: 'Documentation', itemCount: 89, color: '#06B6D4' },
    { type: 'quiz', title: 'Data Structures', content: 'What is a binary tree?', color: '#A855F7' },
    { type: 'note', title: 'Feature Ideas', color: '#22C55E' },
    { type: 'folder', title: 'Templates', itemCount: 15, color: '#84CC16' },
];

interface FloatingWorkspaceCardsProps {
    bottomGradientHeight?: string;
    className?: string;
    opacity?: string; // Custom opacity class
    includeExtraCards?: boolean; // Whether to include extra cards
}

export function FloatingWorkspaceCards({ 
    bottomGradientHeight = '60%', 
    className,
    opacity,
    includeExtraCards = false
}: FloatingWorkspaceCardsProps) {
    // Combine base cards with extra cards if requested - compute directly from props
    const cards = includeExtraCards ? [...BASE_CARDS, ...EXTRA_CARDS] : BASE_CARDS;

    // Ref for visibility detection
    const containerRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(containerRef, { margin: "100px" });

    return (
        <div ref={containerRef} className="absolute inset-0 w-full h-full pointer-events-none select-none z-0">
            {/* 
          Masonry Layout using CSS Columns 
          - 2 columns on mobile
          - 3 columns on tablet
          - 4 columns on desktop
       */}
            <motion.div

                className={cn(
                    "w-[120%] -ml-[10%] -mt-[5%] columns-2 md:columns-3 lg:columns-6 gap-4 md:gap-6 lg:gap-8",
                    opacity || "opacity-20 md:opacity-25",
                    className
                )}
            >
                {cards.map((card, index) => (
                    <FloatingCard
                        key={index}
                        data={card}
                        className="w-full mb-6 md:mb-8"
                    />
                ))}

            </motion.div>

            {/* Gradient Overlay for Fade Out */}
            <div
                className="absolute bottom-0 left-0 right-0 z-10"
                style={{
                    height: bottomGradientHeight,
                    background: 'linear-gradient(to bottom, transparent 0%, var(--background) 90%)'
                }}
            />

            {/* Top fade/vignette to blend with nav if needed */}
            <div
                className="absolute top-0 left-0 right-0 h-32 z-10"
                style={{
                    background: 'linear-gradient(to bottom, var(--background) 0%, transparent 100%)'
                }}
            />
        </div>
    );
}
