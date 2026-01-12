import React from "react";
import { Copy, Columns } from "lucide-react";


interface ItemOpenPromptProps {
    position: { x: number; y: number };
    onReplace: () => void;
    onSplit: () => void;
    onCancel: () => void;
}

export function ItemOpenPrompt({ position, onReplace, onSplit, onCancel }: ItemOpenPromptProps) {
    // Prevent click propagation to avoid closing immediately if click logic is complex
    const handleContainerClick = (e: React.MouseEvent) => {
        e.stopPropagation();
    };

    return (
        <>
            {/* Full-screen backdrop to catch clicks anywhere */}
            <div
                className="fixed inset-0 z-[9998]"
                onClick={onCancel}
            />
            <div
                className="fixed z-[9999] pointer-events-auto"
                style={{
                    left: position.x,
                    top: position.y,
                    transform: 'translate(-50%, -20px)' // Center horizontally, directly above cursor
                }}
                onClick={handleContainerClick}
            >

                <div
                    className="relative z-50 flex flex-col min-w-[8rem] p-1 bg-popover text-popover-foreground rounded-md border shadow-md overflow-hidden"
                >
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onReplace();
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer select-none outline-none"
                    >
                        <Copy className="size-4 text-muted-foreground" />
                        <span>Replace</span>
                    </button>

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onSplit();
                        }}
                        className="flex items-center gap-2 px-2 py-1.5 text-sm text-popover-foreground hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer select-none outline-none"
                    >
                        <Columns className="size-4 text-muted-foreground" />
                        <span>Split View</span>
                    </button>
                </div>
            </div>
        </>
    );
}
