"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error(error);
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
