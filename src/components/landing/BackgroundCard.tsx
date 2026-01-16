import type { CardColor } from "@/lib/workspace-state/colors";
import { getCardColorCSS } from "@/lib/workspace-state/colors";

export interface BackgroundCardData {
    top: string;
    left: string;
    width: string;
    height: string;
    color: CardColor;
    rotation: number;
}

interface BackgroundCardProps {
    card: BackgroundCardData;
    isDesktopOnly?: boolean;
}

export function BackgroundCard({ card, isDesktopOnly = false }: BackgroundCardProps) {
    return (
        <div
            style={{
                position: "absolute",
                top: card.top,
                left: card.left,
                width: card.width,
                height: card.height,
                backgroundColor: getCardColorCSS(card.color as CardColor, 0.5),
                transform: `rotate(${card.rotation}deg)`,
                opacity: 0.5,
            }}
            className={`rounded-md border border-foreground/20 shadow-xl ${isDesktopOnly ? 'hidden md:block' : ''}`}
        >
            {/* Card content placeholder */}
            <div className="p-3 h-full flex flex-col gap-2">
                <div className="h-2 w-3/4 rounded bg-foreground/20" />
                <div className="h-1.5 w-full rounded bg-foreground/15" />
                <div className="h-1.5 w-5/6 rounded bg-foreground/15" />
                <div className="flex-1" />
                <div className="h-1 w-1/2 rounded bg-foreground/10" />
            </div>
        </div>
    );
}

// Random card colors for background
export const cardColors: CardColor[] = [
    "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
    "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];
