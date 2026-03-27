"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { capturePosthogException } from "@/lib/posthog-capture-exception";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
        try {
            capturePosthogException(error, {
                error_boundary: "next_global_error",
                ...(error.digest ? { digest: error.digest } : {}),
            });
        } catch (telemetryError) {
            console.error("Failed to capture global error in PostHog:", telemetryError);
        }
    }, [error]);

    return (
        <html lang="en" suppressHydrationWarning>
            <body className="subpixel-antialiased bg-background text-foreground font-sans">
                <div className="flex h-screen flex-col items-center justify-center space-y-4 text-center">
                    <div className="space-y-2">
                        <h2 className="text-3xl font-bold tracking-tight font-heading">
                            Critical System Error
                        </h2>
                        <p className="text-muted-foreground max-w-[500px]">
                            {error.message || "An unexpected critical error occurred. We apologize for the inconvenience."}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => window.location.reload()}>
                            Reload Application
                        </Button>
                        <Button onClick={() => reset()}>Try Again</Button>
                    </div>
                </div>
            </body>
        </html>
    );
}
