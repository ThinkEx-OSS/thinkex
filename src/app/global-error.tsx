"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";

const inter = Inter({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-inter",
});

const outfit = Outfit({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-outfit",
});

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <html lang="en" className={`dark ${inter.variable} ${outfit.variable}`}>
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
