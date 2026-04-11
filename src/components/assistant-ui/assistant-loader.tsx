"use client";

import { memo, lazy, Suspense } from "react";
import { useAuiState } from "@assistant-ui/react";
import { useTheme } from "next-themes";

const DotLottieReact = lazy(() =>
  import("@lottiefiles/dotlottie-react").then((m) => ({ default: m.DotLottieReact }))
);

const AssistantLoaderImpl = () => {
    const { resolvedTheme } = useTheme();
    const isRunning = useAuiState(
        ({ message }) => (message as { status?: { type: string } })?.status?.type === "running"
    );

    const isMessageEmpty = useAuiState(({ message }) => {
        const msg = message as any;
        return !msg?.content || (Array.isArray(msg.content) && msg.content.length === 0);
    });

    if (!isRunning || !isMessageEmpty) return null;

    const lottieSrc = resolvedTheme === 'light' ? '/thinkexlight.lottie' : '/logo.lottie';

    return (
        <div className="flex items-center gap-3 py-2">
            <Suspense fallback={<div className="w-4 h-4" />}>
                <DotLottieReact
                    src={lottieSrc}
                    loop
                    autoplay
                    mode="bounce"
                    className="w-4 h-4 self-center"
                />
            </Suspense>
            <span className="text-base text-muted-foreground">Thinking...</span>
        </div>
    );
};

export const AssistantLoader = memo(AssistantLoaderImpl);
