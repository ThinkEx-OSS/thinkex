"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { AuthPageBackground } from "@/components/auth/AuthPageBackground";
import { SidebarProvider } from "@/components/ui/sidebar";

/**
 * Handles anonymous session checking and redirects to guest-setup if no session.
 * Shows a loading state while checking the session.
 */
export function AnonymousSessionHandler({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    // If no session and not loading, redirect to guest-setup
    if (!isPending && !session) {
      router.replace("/guest-setup");
      return;
    }
  }, [session, isPending, router]);

  // Show loading while checking session
  if (isPending) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
        {/* Background with grid and cards - same as auth page */}
        <AuthPageBackground />

        {/* Content */}
        <div className="relative z-10 text-center space-y-6 max-w-md">
          <div className="flex justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-white" />
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Setting up your workspace...
          </h1>
          <p className="text-sm text-white/70">
            This will only take a moment
          </p>
        </div>
      </main>
    );
  }

  // Don't render children if no session (will redirect)
  if (!session) {
    return null;
  }

  return <>{children}</>;
}

/**
 * Wrapper for sidebar provider with default open state.
 */
export function SidebarCoordinator({ 
  children, 
  defaultOpen = false 
}: { 
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      {children}
    </SidebarProvider>
  );
}
