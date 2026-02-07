"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export function HeroGlow() {
    const { resolvedTheme } = useTheme();
    const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            // Use requestAnimationFrame to throttle state updates if needed, 
            // but React 18 automatic batching usually handles this well.
            // For creating a buttery smooth effect, updating on every frame is okay 
            // as long as the component is lightweight.
            setMousePosition({
                x: e.clientX / window.innerWidth,
                y: e.clientY / window.innerHeight,
            });
        };
        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, []);

    // Calculate glow intensity based on distance from hero center
    const centerX = 0.5;
    const centerY = 0.45; // Hero is slightly above center
    const distance = Math.sqrt(
        Math.pow(mousePosition.x - centerX, 2) +
        Math.pow(mousePosition.y - centerY, 2)
    );
    // Glow is strongest at center (distance=0), fades as you move away
    const glowIntensity = Math.max(0, 1 - distance * 2);

    return (
        <>
            {/* Hero glow - only in dark mode */}
            {resolvedTheme === 'dark' && (
                <div
                    className="absolute -inset-20 rounded-3xl pointer-events-none transition-opacity duration-300"
                    style={{
                        background: `radial-gradient(ellipse at center,
                rgba(255, 192, 203, ${0.65 + glowIntensity * 0.10}) 0%,
                rgba(255, 182, 193, ${0.55 + glowIntensity * 0.10}) 35%,
                rgba(255, 105, 180, 0.14) 80%,
                rgba(255, 20, 147, 0.06) 100%)`,
                        filter: `blur(${32 + glowIntensity * 18}px)`,
                        opacity: 1,
                        zIndex: 0,
                    }}
                />
            )}
            {/* Dark ambient blur for text readability - only in dark mode */}
            {resolvedTheme === 'dark' && (
                <div
                    className="absolute -inset-8 rounded-3xl pointer-events-none"
                    style={{
                        background: 'radial-gradient(ellipse at center, rgba(0, 0, 0, 0.5) 0%, rgba(0, 0, 0, 0.25) 40%, transparent 70%)',
                        filter: 'blur(20px)',
                        zIndex: 1,
                    }}
                />
            )}
        </>
    );
}
