"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthPageBackground } from "@/components/auth/AuthPageBackground";

/**
 * Onboarding page for new users
 * 
 * This page is shown after signup to:
 * 1. Display a welcome message while the workspace is being created
 * 2. Call the onboarding API to create the user profile and demo workspace
 * 3. Redirect to the new workspace once ready
 */
export default function OnboardingPage() {
    const router = useRouter();
    const [status, setStatus] = useState<"loading" | "error">("loading");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const hasStartedRef = useRef(false);

    useEffect(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;

        const controller = new AbortController();

        const runOnboarding = async () => {
            try {
                // Check for redirect_url from share links or other auth flows
                const getRedirectUrl = (): string | null => {
                    if (typeof window === "undefined") return null;

                    // First check current URL query params
                    const currentUrl = new URL(window.location.href);
                    const urlRedirect = currentUrl.searchParams.get("redirect_url");
                    if (urlRedirect) {
                        sessionStorage.setItem("auth_redirect_url", urlRedirect);
                        return urlRedirect;
                    }

                    // Fallback to sessionStorage
                    return sessionStorage.getItem("auth_redirect_url");
                };

                const redirectUrl = getRedirectUrl();

                // Call the onboarding API to create profile + workspace
                const res = await fetch("/api/user/onboarding", { signal: controller.signal });

                if (!res.ok) {
                    throw new Error("Failed to set up your workspace");
                }

                const data = await res.json();

                // If there's a redirect_url that's NOT a dashboard route (e.g., share links),
                // prioritize that over the onboarding redirect
                if (redirectUrl && !redirectUrl.startsWith("/dashboard") && !redirectUrl.startsWith("/onboarding")) {
                    sessionStorage.removeItem("auth_redirect_url");
                    router.replace(redirectUrl);
                } else if (data.redirectTo) {
                    // Use the onboarding redirect (demo workspace)
                    router.replace(data.redirectTo);
                } else {
                    // Existing user, go to dashboard
                    router.replace("/dashboard");
                }
            } catch (error) {
                if ((error as Error).name !== "AbortError") {
                    console.error("Onboarding error:", error);
                    setStatus("error");
                    setErrorMessage((error as Error).message || "Something went wrong");
                }
            }
        };

        runOnboarding();

        return () => {
            controller.abort();
        };
    }, [router]);

    return (
        <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
            {/* Background with grid and cards - same as auth page */}
            <AuthPageBackground />

            {/* Content */}
            <div className="relative z-10 text-center space-y-6 max-w-md">
                {status === "loading" && (
                    <>
                        <div className="flex justify-center">
                            <Loader2 className="w-10 h-10 animate-spin text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
                            Setting up your workspace...
                        </h1>
                        <p className="text-sm text-white/70">
                            This will only take a moment
                        </p>
                    </>
                )}

                {status === "error" && (
                    <>
                        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
                            Something went wrong
                        </h1>
                        <p className="text-lg text-white/70">
                            {errorMessage || "Failed to set up your workspace"}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-4 py-2 bg-white text-black rounded-md hover:bg-white/90 transition-colors font-medium"
                        >
                            Try Again
                        </button>
                    </>
                )}
            </div>
        </main>
    );
}
