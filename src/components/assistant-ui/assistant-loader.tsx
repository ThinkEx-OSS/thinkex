"use client";

import { useAuiState } from "@assistant-ui/react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

export const AssistantLoader = () => {
    const isRunning = useAuiState(
        ({ message }) => (message as { status?: { type: string } })?.status?.type === "running"
    );

    const isMessageEmpty = useAuiState(({ message }) => {
        const msg = message as any;
        return !msg?.content || (Array.isArray(msg.content) && msg.content.length === 0);
    });

    if (!isRunning || !isMessageEmpty) return null;

    return (
        <div className="flex items-center gap-3 py-2">
            <DotLottieReact
                src="/logo.lottie"
                loop
                autoplay
                mode="bounce"
                className="w-4 h-4 self-center"
            />
            <span className="text-base text-muted-foreground">Thinking...</span>
        </div>
    );
};
