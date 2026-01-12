"use client";

import { memo, type ReactNode, useMemo, useState, useEffect, useRef } from "react";
import { getCardColorCSS, getCardAccentColor, type CardColor } from "@/lib/workspace-state/colors";

interface FlipCardProps {
    front: ReactNode;
    back: ReactNode;
    className?: string;
    color?: string;
    isFlipped: boolean;
    borderColor?: string;
    borderWidth?: string;
}

// Memoize the entire FlipCard to prevent unnecessary re-renders
export const FlipCard = memo(function FlipCard({ front, back, className = "", color, isFlipped, borderColor, borderWidth }: FlipCardProps) {
    // Track animation state to control content visibility
    const [isAnimating, setIsAnimating] = useState(false);
    const [showFront, setShowFront] = useState(!isFlipped);
    const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const prevFlippedRef = useRef(isFlipped);

    // Memoize colors to prevent recalculation - use same colors as WorkspaceCard
    const cardBgColor = useMemo(() =>
        color ? getCardColorCSS(color as CardColor, 0.4) : 'var(--card)',
        [color]);

    // Handle flip state changes
    useEffect(() => {
        if (prevFlippedRef.current !== isFlipped) {
            prevFlippedRef.current = isFlipped;
            setIsAnimating(true);

            // Clear any existing timeout
            if (animationTimeoutRef.current) {
                clearTimeout(animationTimeoutRef.current);
            }

            // At the midpoint of the animation (300ms), switch which content is visible
            animationTimeoutRef.current = setTimeout(() => {
                setShowFront(!isFlipped);
            }, 280);

            // Animation complete
            setTimeout(() => {
                setIsAnimating(false);
            }, 600);
        }

        return () => {
            if (animationTimeoutRef.current) {
                clearTimeout(animationTimeoutRef.current);
            }
        };
    }, [isFlipped]);

    // Static box shadow
    const boxShadow = "0 8px 30px rgba(0, 0, 0, 0.2)";

    return (
        <div
            className={`flip-card flip-card-content ${className}`}
            style={{
                width: "100%",
                height: "100%",
                perspective: "1500px",
                cursor: "pointer",
            }}
        >
            <div
                className="flip-card-inner"
                style={{
                    position: "relative",
                    width: "100%",
                    height: "100%",
                    transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                    transformStyle: "preserve-3d",
                    transform: isFlipped ? "rotateX(180deg)" : "rotateX(0deg)",
                    transformOrigin: "center center",
                }}
            >
                {/* Front Side */}
                <div
                    className="flip-card-front"
                    style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        backgroundColor: cardBgColor,
                        borderRadius: "6px",
                        boxShadow,
                        border: borderColor && borderWidth ? `${borderWidth} solid ${borderColor}` : 'none',
                        overflow: "hidden",
                    }}
                >
                    {/* Content wrapper with visibility control */}
                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            visibility: showFront ? "visible" : "hidden",
                            opacity: showFront ? 1 : 0,
                        }}
                    >
                        {front}
                    </div>
                </div>

                {/* Back Side */}
                <div
                    className="flip-card-back"
                    style={{
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        backfaceVisibility: "hidden",
                        WebkitBackfaceVisibility: "hidden",
                        backgroundColor: cardBgColor,
                        borderRadius: "6px",
                        boxShadow,
                        border: borderColor && borderWidth ? `${borderWidth} solid ${borderColor}` : 'none',
                        transform: "rotateX(180deg)",
                        overflow: "hidden",
                    }}
                >
                    {/* Content wrapper with visibility control */}
                    <div
                        style={{
                            width: "100%",
                            height: "100%",
                            visibility: !showFront ? "visible" : "hidden",
                            opacity: !showFront ? 1 : 0,
                        }}
                    >
                        {back}
                    </div>
                </div>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Only re-render if these specific props change
    return (
        prevProps.isFlipped === nextProps.isFlipped &&
        prevProps.color === nextProps.color &&
        prevProps.className === nextProps.className &&
        prevProps.front === nextProps.front &&
        prevProps.back === nextProps.back &&
        prevProps.borderColor === nextProps.borderColor &&
        prevProps.borderWidth === nextProps.borderWidth
    );
});

export default FlipCard;
