"use client";

import { useEffect, useState } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { FloatingCard, type FloatingCardData } from "./FloatingCard";
import { type CardColor } from "@/lib/workspace-state/colors";
import { cn } from "@/lib/utils";

// Realistic mock data
// Using colors from the palette loosely
const MOCK_CARDS: FloatingCardData[] = [
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

interface FloatingWorkspaceCardsProps {
    bottomGradientHeight?: string;
    enableParallax?: boolean;
    className?: string;
}

export function FloatingWorkspaceCards({ bottomGradientHeight = '60%', enableParallax = true, className }: FloatingWorkspaceCardsProps) {
    // We can randomize the order on mount if we want, or keep it static for consistency
    // Keeping specific shuffle for now to ensure good distribution if we want
    const [cards, setCards] = useState<FloatingCardData[]>(MOCK_CARDS);

    // Parallax effect
    const { scrollY } = useScroll();
    const yParallax = useTransform(scrollY, [0, 1000], [0, 400]);
    const y = enableParallax ? yParallax : 0;

    return (
        <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none z-0">
            {/* 
          Masonry Layout using CSS Columns 
          - 2 columns on mobile
          - 3 columns on tablet
          - 4 columns on desktop
       */}
            <motion.div
                style={{ y }}
                className={cn(
                    "w-[120%] -ml-[10%] -mt-[5%] columns-2 md:columns-3 lg:columns-6 gap-4 md:gap-6 lg:gap-8 opacity-20 md:opacity-25",
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
