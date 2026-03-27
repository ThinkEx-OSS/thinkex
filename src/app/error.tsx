"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { capturePosthogException } from "@/lib/posthog-capture-exception";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
        capturePosthogException(error, {
            error_boundary: "next_app_error",
            ...(error.digest ? { digest: error.digest } : {}),
        });
    }, [error]);

    return (
        <div className="flex h-screen flex-col items-center justify-center space-y-4 text-center">
            <div className="space-y-2">
                <h2 className="text-2xl font-bold tracking-tight">Something went wrong!</h2>
                <p className="text-muted-foreground">
                    {error.message || "An unexpected error occurred."}
                </p>
            </div>
            <div className="flex gap-2">
                <Button variant="outline" onClick={() => window.location.reload()}>
                    Reload Page
                </Button>
                <Button onClick={() => reset()}>Try Again</Button>
            </div>
        </div>
    );
}
