"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { AuthPageBackground } from "@/components/auth/AuthPageBackground";

interface InviteGuardProps {
    children: React.ReactNode;
}

export function InviteGuard({ children }: InviteGuardProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const inviteToken = searchParams.get('invite');
    const { data: session, isPending: isSessionLoading } = useSession();

    // Handle invitation auto-claiming
    useEffect(() => {
        async function claimInvite() {
            if (!inviteToken || !session?.user || session.user.isAnonymous || isSessionLoading) return;

            try {
                const res = await fetch('/api/invites/claim', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token: inviteToken })
                });

                const data = await res.json();

                if (res.ok) {
                    toast.success('Invitation accepted!');

                    // 1. Remove invite param using router to trigger re-render in WorkspaceContext
                    // This removes the 'pause' on the workspace query
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.delete('invite');
                    router.replace(newUrl.pathname + newUrl.search);
                } else {
                    // Error case (e.g. 404 Not Found - likely because already claimed or double-fired)
                    // Don't toast error immediately for 404/410 to avoid confusing users if they actually ARE added
                    if (res.status !== 404 && res.status !== 410) {
                        toast.error(data.message || data.error || 'Failed to accept invitation');
                    }

                    // Just remove the param and stay on the page. 
                    const newUrl = new URL(window.location.href);
                    newUrl.searchParams.delete('invite');
                    router.replace(newUrl.pathname + newUrl.search);
                }
            } catch (e) {
                console.error(e);
                // On network error etc, just clean URL and let it fail gracefully
                const newUrl = new URL(window.location.href);
                newUrl.searchParams.delete('invite');
                router.replace(newUrl.pathname + newUrl.search);
            }
        }

        claimInvite();
    }, [inviteToken, session, isSessionLoading, router]);

    // 2. Invite Token Present: Handle Invite Flow
    // Handle redirect for unauthenticated users in an effect to avoid "Cannot update a component while rendering"
    useEffect(() => {
        if (inviteToken && (!session || session.user?.isAnonymous) && !isSessionLoading) {
            const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
            router.replace(`/auth/sign-up?invite=${inviteToken}&redirect_url=${encodeURIComponent(currentUrl)}`);
        }
    }, [inviteToken, session, isSessionLoading, router]);

    // 1. Loading Session: Show Loader
    if (isSessionLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center bg-black/95">
                <Loader2 className="h-8 w-8 animate-spin text-white/50" />
            </div>
        );
    }

    if (inviteToken) {
        // If not logged in (or anonymous), show loader (or null) while redirecting
        if (!session || session.user?.isAnonymous) {
            return null;
        }

        // If logged in, we are "claiming" the invite. Show loading state.
        // The useEffect above will handle the network request and redirect.
        return (
            <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
                <div className="absolute inset-0 bg-black z-0" />
                <AuthPageBackground />

                <div className="relative z-10 text-center space-y-6 max-w-md">
                    <div className="flex justify-center">
                        <Loader2 className="w-10 h-10 animate-spin text-white" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
                        Joining workspace...
                    </h1>
                    <p className="text-sm text-white/70">
                        This will only take a moment
                    </p>
                </div>
            </main>
        );
    }

    // 3. No Invite Token: Render Dashboard (Safe)
    return <>{children}</>;
}
