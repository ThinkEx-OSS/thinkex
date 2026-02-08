"use client";

import { FloatingCard, type FloatingCardData } from "./FloatingCard";
import { cn } from "@/lib/utils";
import { useRef, useState, useEffect } from "react";
import { useTheme } from "next-themes";

// Base cards for landing page
const BASE_CARDS: FloatingCardData[] = [
    // Column 1ish - The Origins of Light at top for visibility
    { type: 'youtube', youtubeUrl: 'https://youtu.be/tGVnBAHLApA', thumbnailUrl: 'https://img.youtube.com/vi/tGVnBAHLApA/sddefault.jpg' }, // New video
    { type: 'note', title: 'Product Vision 2025', color: '#3B82F6' },
    { type: 'note', title: 'Tech Stack Decision Log', color: '#E11D48' },
    { type: 'flashcard', content: 'What is the primary function of the hippocampus?', color: '#EF4444' },

    // Column 2ish
    { type: 'folder', title: 'Research Papers', itemCount: 12, color: '#10B981' },
    { type: 'pdf', title: 'Q4 Financial Report.pdf', color: '#F59E0B', aspectRatio: '1/1.1' },
    { type: 'note', title: 'Meeting Notes: Design Sync', color: '#8B5CF6' },
    { type: 'flashcard', content: 'Define "Neuroplasticity"', color: '#EC4899' },

    // Column 3ish
    { type: 'folder', title: 'Biology Lecture Slides', itemCount: 48, color: '#06B6D4' },
    { type: 'note', title: 'Ideas for Marketing', color: '#F97316' },
    { type: 'quiz', title: 'Neuroscience Quiz', content: 'Which brain region processes memory?', color: '#8B5CF6' },
    { type: 'folder', title: 'Cognitive Science', itemCount: 24, color: '#14B8A6' },

    // Column 4ish
    { type: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=WUvTyaaNkzM', thumbnailUrl: 'https://img.youtube.com/vi/WUvTyaaNkzM/sddefault.jpg' },
    { type: 'folder', title: 'Archive 2024', itemCount: 156, color: '#6366F1' },
    { type: 'pdf', title: 'User_Interview_Script_v2.pdf', color: '#6366F1' },
    { type: 'folder', title: 'Neurology Resources', itemCount: 18, color: '#8B5CF6' },
];

// Additional cards for home route only
const EXTRA_CARDS: FloatingCardData[] = [
    { type: 'note', title: 'Learning Path: React', color: '#0EA5E9' },
    { type: 'flashcard', content: 'What is the difference between let and const?', color: '#3B82F6' },
    { type: 'folder', title: 'Biology Lecture Slides', itemCount: 32, color: '#10B981' },
    { type: 'pdf', title: 'API_Documentation.pdf', color: '#F59E0B', aspectRatio: '1/1.2' },
    { type: 'quiz', title: 'JavaScript Basics', content: 'What is a closure?', color: '#8B5CF6' },
    { type: 'note', title: 'Project Roadmap Q1', color: '#EC4899' },
    { type: 'folder', title: 'Design System', itemCount: 67, color: '#14B8A6' },
    { type: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=P6FORpg0KVo', thumbnailUrl: 'https://img.youtube.com/vi/P6FORpg0KVo/sddefault.jpg' },
    { type: 'flashcard', content: 'Explain the concept of recursion', color: '#EF4444' },
    { type: 'note', title: 'Team Meeting Notes', color: '#F97316' },
    { type: 'pdf', title: 'System_Architecture.pdf', color: '#6366F1', aspectRatio: '1/1.1' },
    { type: 'folder', title: 'Documentation', itemCount: 89, color: '#06B6D4' },
    { type: 'quiz', title: 'Data Structures', content: 'What is a binary tree?', color: '#A855F7' },
    { type: 'note', title: 'Feature Ideas', color: '#22C55E' },
    { type: 'folder', title: 'Templates', itemCount: 15, color: '#84CC16' },
    // Extended cards for full page scroll
    { type: 'note', title: 'Sprint Planning Notes', color: '#3B82F6' },
    { type: 'flashcard', content: 'What is the Big O notation for binary search?', color: '#10B981' },
    { type: 'folder', title: 'Physics Lab Reports', itemCount: 23, color: '#F59E0B' },
    { type: 'pdf', title: 'Brand_Guidelines.pdf', color: '#EC4899', aspectRatio: '1/1.1' },
    { type: 'quiz', title: 'TypeScript Fundamentals', content: 'What is a generic type?', color: '#06B6D4' },
    { type: 'note', title: 'Backend Architecture', color: '#8B5CF6' },
    { type: 'folder', title: 'UI Components', itemCount: 45, color: '#EF4444' },
    { type: 'flashcard', content: 'Explain event bubbling vs capturing', color: '#F97316' },
    { type: 'pdf', title: 'Security_Audit_Report.pdf', color: '#6366F1' },
    { type: 'note', title: 'Database Schema', color: '#14B8A6' },
    { type: 'folder', title: 'Test Suites', itemCount: 78, color: '#A855F7' },
    { type: 'quiz', title: 'React Hooks', content: 'When should you use useMemo?', color: '#3B82F6' },
    { type: 'flashcard', content: 'What is the virtual DOM?', color: '#22C55E' },
    { type: 'note', title: 'API Endpoints', color: '#0EA5E9' },
    { type: 'folder', title: 'Figma Exports', itemCount: 34, color: '#EC4899' },
    { type: 'pdf', title: 'Performance_Metrics.pdf', color: '#6366F1', aspectRatio: '1/1.2' },
];

interface FloatingWorkspaceCardsProps {
    bottomGradientHeight?: string;
    className?: string;
    includeExtraCards?: boolean;
}

export function FloatingWorkspaceCards({
    bottomGradientHeight = '60%',
    className,
    includeExtraCards = false,
}: FloatingWorkspaceCardsProps) {
    const { resolvedTheme } = useTheme();
    const cards = includeExtraCards ? [...BASE_CARDS, ...EXTRA_CARDS] : BASE_CARDS;
    const [transform, setTransform] = useState({ x: 0, y: 0 });
    const rafRef = useRef<number | null>(null);

    // Use window-level mouse tracking to avoid pointer-events issues
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                // Calculate mouse position relative to viewport center
                const relX = e.clientX / window.innerWidth;
                const relY = e.clientY / window.innerHeight;
                // Push cards away from cursor - negate to move opposite direction
                const pushIntensity = 20;
                const offsetX = -(relX - 0.5) * pushIntensity;
                const offsetY = -(relY - 0.5) * pushIntensity;
                setTransform({ x: offsetX, y: offsetY });
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    return (
        <div className="absolute inset-0 w-full h-full pointer-events-none select-none z-0">
            {/* Breathing animation keyframes */}
            <style jsx>{`
                @keyframes floatingCardBreathe {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                }
            `}</style>

            {/* Cards layer - darkened */}
            <div
                className={cn(
                    "absolute inset-0 w-[120%] -ml-[10%] -mt-[5%] columns-2 md:columns-3 lg:columns-6 gap-4 md:gap-6 lg:gap-8 transition-transform duration-800 ease-out pointer-events-none",
                    resolvedTheme === 'dark' ? "opacity-30" : "opacity-50",
                    className
                )}
                style={{
                    transform: `translate(${transform.x}px, ${transform.y}px)`,
                }}
            >
                {cards.map((card, index) => (
                    <FloatingCard
                        key={index}
                        data={card}
                        className="w-full mb-6 md:mb-8"
                        breatheDelay={index * 0.3}
                    />
                ))}
            </div>

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
