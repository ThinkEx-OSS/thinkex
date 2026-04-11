"use client";

import { lazy, Suspense } from "react";
import { useTheme } from "next-themes";

const DotLottieReact = lazy(() =>
  import("@lottiefiles/dotlottie-react").then((m) => ({ default: m.DotLottieReact }))
);

export const AssistantLoaderVisual = () => {
    const { resolvedTheme } = useTheme();
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
