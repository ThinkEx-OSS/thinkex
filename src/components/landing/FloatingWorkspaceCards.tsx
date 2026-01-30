"use client";

import { useRef, useState, useEffect } from "react";
import { motion, useInView } from "motion/react";
import { FloatingCard, type FloatingCardData } from "./FloatingCard";
import { type CardColor } from "@/lib/workspace-state/colors";
import { cn } from "@/lib/utils";

// Base cards for landing page
const BASE_CARDS: FloatingCardData[] = [
    // Column 1ish - The Origins of Light at top for visibility
    { type: 'youtube', youtubeUrl: 'https://www.youtube.com/watch?v=aXRTczANuIs', thumbnailUrl: 'https://img.youtube.com/vi/aXRTczANuIs/sddefault.jpg' }, // The Origins of Light
    { type: 'note', title: 'Product Vision 2025', color: '#3B82F6' },
    { type: 'note', title: 'Tech Stack Decision Log', color: '#E11D48' },
    { type: 'flashcard', content: 'What is the primary function of the hippocampus?', color: '#EF4444' },

    // Column 2ish
    { type: 'folder', title: 'Research Papers', itemCount: 12, color: '#10B981' },
    { type: 'pdf', title: 'Q4 Financial Report.pdf', color: '#F59E0B', aspectRatio: '1/1.1' },
    { type: 'note', title: 'Meeting Notes: Design Sync', color: '#8B5CF6' },
    { type: 'flashcard', content: 'Define "Neuroplasticity"', color: '#EC4899' },

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
    { type: 'folder', title: 'Client Projects', itemCount: 23, color: '#F59E0B' },
    { type: 'pdf', title: 'Brand_Guidelines.pdf', color: '#EC4899', aspectRatio: '1/1.1' },
    { type: 'quiz', title: 'TypeScript Fundamentals', content: 'What is a generic type?', color: '#06B6D4' },
    { type: 'note', title: 'Backend Architecture', color: '#8B5CF6' },
    { type: 'folder', title: 'UI Components', itemCount: 45, color: '#EF4444' },
    { type: 'flashcard', content: 'Explain event bubbling vs capturing', color: '#F97316' },
    { type: 'pdf', title: 'Security_Audit_Report.pdf', color: '#64748B' },
    { type: 'note', title: 'Database Schema', color: '#14B8A6' },
    { type: 'folder', title: 'Test Suites', itemCount: 78, color: '#A855F7' },
    { type: 'quiz', title: 'React Hooks', content: 'When should you use useMemo?', color: '#3B82F6' },
    { type: 'flashcard', content: 'What is the virtual DOM?', color: '#22C55E' },
    { type: 'note', title: 'API Endpoints', color: '#0EA5E9' },
    { type: 'folder', title: 'Figma Exports', itemCount: 34, color: '#EC4899' },
    { type: 'pdf', title: 'Performance_Metrics.pdf', color: '#6366F1', aspectRatio: '1/1.2' },
];

interface Ripple {
    id: number;
    x: number;
    y: number;
}

interface FloatingWorkspaceCardsProps {
    bottomGradientHeight?: string;
    className?: string;
    opacity?: string;
    includeExtraCards?: boolean;
    mousePosition?: { x: number; y: number };
    ripples?: Ripple[];
    scrollY?: number;
}

export function FloatingWorkspaceCards({
    bottomGradientHeight = '60%',
    className,
    opacity,
    includeExtraCards = false,
    mousePosition: externalMousePosition,
    ripples = [],
    scrollY = 0,
}: FloatingWorkspaceCardsProps) {
    const cards = includeExtraCards ? [...BASE_CARDS, ...EXTRA_CARDS] : BASE_CARDS;

    const containerRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(containerRef, { margin: "100px" });

    // Use external mouse position if provided, otherwise track internally
    const [internalMousePosition, setInternalMousePosition] = useState({ x: 0.5, y: 0.5 });
    const [isMobile, setIsMobile] = useState(false);
    const rafRef = useRef<number | undefined>(undefined);

    const mousePosition = externalMousePosition || internalMousePosition;

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    useEffect(() => {
        // Skip internal tracking if external position is provided
        if (externalMousePosition || isMobile) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
            rafRef.current = requestAnimationFrame(() => {
                setInternalMousePosition({
                    x: e.clientX / window.innerWidth,
                    y: e.clientY / window.innerHeight,
                });
            });
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => {
            window.removeEventListener("mousemove", handleMouseMove);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [isMobile, externalMousePosition]);

    // Parallax offset calculation
    const parallaxIntensity = 25;
    const offsetX = isMobile ? 0 : (mousePosition.x - 0.5) * parallaxIntensity;
    const offsetY = isMobile ? 0 : (mousePosition.y - 0.5) * parallaxIntensity;

    // Spotlight mask - mouse position reveals cards, hero center always slightly visible
    // Adjust Y position to account for scroll in the 250vh container
    const containerHeightVh = 250;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1000;
    const mouseX = mousePosition.x * 100;
    // Convert viewport-relative mouse Y to container-relative Y
    const mouseYAbsolute = scrollY + (mousePosition.y * viewportHeight);
    const containerHeight = (containerHeightVh / 100) * viewportHeight;
    const mouseY = (mouseYAbsolute / containerHeight) * 100;
    const heroX = 50; // Hero center X
    // Hero Y also needs adjustment based on scroll
    const heroYAbsolute = scrollY + (0.45 * viewportHeight); // 45% of viewport
    const heroY = (heroYAbsolute / containerHeight) * 100;

    // Calculate scroll progress (0 at top, 1 at bottom) for fading effect
    const maxScroll = containerHeight - viewportHeight;
    const scrollProgress = Math.min(1, Math.max(0, scrollY / maxScroll));
    // Fade spotlight to 50% brightness at the bottom
    const fadeFactor = 1 - (scrollProgress * 0.5);

    // Calculate tendril connection point (between hero and mouse, closer to hero)
    const tendrilX = heroX + (mouseX - heroX) * 0.4;
    const tendrilY = heroY + (mouseY - heroY) * 0.4;

    // Combine mouse spotlight + hero glow + tendril connection
    // Mouse is smaller but stronger, hero extends towards mouse with pronounced tendril
    // Spotlight fades as user scrolls down
    const spotlightMask = isMobile
        ? `radial-gradient(ellipse 50% 40% at 50% 45%, rgba(0,0,0,${0.5 * fadeFactor}) 0%, rgba(0,0,0,${0.15 * fadeFactor}) 60%, rgba(0,0,0,0) 100%)`
        : `radial-gradient(circle 98px at ${mouseX}% ${mouseY}%, rgba(0,0,0,${0.325 * fadeFactor}) 0%, rgba(0,0,0,${0.25 * fadeFactor}) 75%, rgba(0,0,0,0) 85%),
           radial-gradient(ellipse 30% 24% at ${tendrilX}% ${tendrilY}%, rgba(0,0,0,${0.25 * fadeFactor}) 0%, rgba(0,0,0,${0.125 * fadeFactor}) 60%, rgba(0,0,0,0) 100%),
           radial-gradient(ellipse 32% 26% at ${heroX}% ${heroY}%, rgba(0,0,0,${0.85 * fadeFactor}) 0%, rgba(0,0,0,${0.4 * fadeFactor}) 50%, rgba(0,0,0,0) 100%)`;

    return (
        <div ref={containerRef} className="absolute inset-0 w-full h-full pointer-events-none select-none z-0">
            {/* Breathing animation keyframes + ripple animation */}
            <style jsx>{`
                @keyframes floatingCardBreathe {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.02); }
                }
                @keyframes rippleExpand {
                    0% {
                        transform: translate(-50%, -50%) scale(0);
                        opacity: 1;
                    }
                    100% {
                        transform: translate(-50%, -50%) scale(1);
                        opacity: 0;
                    }
                }
            `}</style>

            {/* Spotlight container - reveals cards where mouse/hero glow is */}
            <div
                className="absolute inset-0 transition-[mask-image] duration-300 ease-out"
                style={{
                    maskImage: spotlightMask,
                    WebkitMaskImage: spotlightMask,
                    maskComposite: 'add',
                    WebkitMaskComposite: 'source-over',
                }}
            >
                {/* Single masonry container with parallax */}
                <motion.div
                    className={cn(
                        "w-[120%] -ml-[10%] -mt-[5%] columns-2 md:columns-3 lg:columns-6 gap-4 md:gap-6 lg:gap-8 transition-transform duration-150 ease-out",
                        opacity || "opacity-50 md:opacity-70",
                        className
                    )}
                    style={{
                        transform: `translate(${offsetX}px, ${offsetY}px)`,
                        willChange: isMobile ? undefined : "transform",
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
                </motion.div>
            </div>

            {/* Click ripples - expanding circles that reveal cards */}
            {ripples.map((ripple) => (
                <div
                    key={ripple.id}
                    className="absolute pointer-events-none"
                    style={{
                        left: `${ripple.x * 100}%`,
                        top: `${ripple.y * 100}%`,
                        width: '800px',
                        height: '800px',
                        animation: 'rippleExpand 1.2s ease-out forwards',
                        background: 'radial-gradient(circle, rgba(147, 197, 253, 0.15) 0%, rgba(167, 139, 250, 0.1) 30%, transparent 70%)',
                        borderRadius: '50%',
                    }}
                />
            ))}

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
