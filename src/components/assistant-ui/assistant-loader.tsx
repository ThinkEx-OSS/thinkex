"use client";

import { useIsMessageEmpty, useIsMessageRunning } from "@/lib/chat/runtime";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";
import { useTheme } from "next-themes";

export const AssistantLoader = () => {
    const { resolvedTheme } = useTheme();
    const isRunning = useIsMessageRunning();

    const isMessageEmpty = useIsMessageEmpty();

    if (!isRunning || !isMessageEmpty) return null;

    const lottieSrc = resolvedTheme === 'light' ? '/thinkexlight.lottie' : '/logo.lottie';

    return (
        <div className="flex items-center gap-3 py-2">
            <DotLottieReact
                src={lottieSrc}
                loop
                autoplay
                mode="bounce"
                className="w-4 h-4 self-center"
            />
            <span className="text-base text-muted-foreground">Thinking...</span>
        </div>
    );
};
