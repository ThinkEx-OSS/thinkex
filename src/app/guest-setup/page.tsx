"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { AuthPageBackground } from "@/components/auth/AuthPageBackground";
import { signIn, useSession } from "@/lib/auth-client";

/**
 * Guest Setup page for anonymous users
 * 
 * This page:
 * 1. Creates an anonymous session if one doesn't exist
 * 2. Creates a welcome workspace for the anonymous user
 * 3. Redirects to the workspace once ready
 */
export default function GuestSetupPage() {
    const router = useRouter();
    const { data: session } = useSession();
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const hasStartedRef = useRef(false);

    useEffect(() => {
        // Run only once on mount
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;

        const setupGuest = async () => {
            try {
                // Step 1: Check if already authenticated (not anonymous)
                if (session && !session.user.isAnonymous) {
                    router.replace("/dashboard");
                    return;
                }

                // Step 2: Create anonymous session if needed (no delay - cookie is set immediately)
                if (!session) {
                    await signIn.anonymous();
                    // No delay needed - cookie is set synchronously by Better Auth
                }

                // Step 3: Create welcome workspace
                const res = await fetch("/api/guest/create-welcome-workspace", {
                    method: "POST",
                });

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    throw new Error(errorData.error || "Failed to create welcome workspace");
                }

                const data = await res.json();

                // Step 4: Redirect to the workspace
                if (data.slug) {
                    router.replace(`/dashboard/${data.slug}`);
                } else {
                    router.replace("/dashboard");
                }
            } catch (error) {
                console.error("Guest setup error:", error);
                setErrorMessage((error as Error).message || "Something went wrong");
            }
        };

        setupGuest();
        // No cleanup needed - we run once and don't abort
    }, []); // Empty deps - run once on mount only


    return (
        <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
            {/* Background with grid and cards - same as auth page */}
            <AuthPageBackground />

            {/* Content */}
            <div className="relative z-10 text-center space-y-6 max-w-md">
                {!errorMessage ? (
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
                ) : (
                    <>
                        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
                            Something went wrong
                        </h1>
                        <p className="text-lg text-white/70">
                            {errorMessage}
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
