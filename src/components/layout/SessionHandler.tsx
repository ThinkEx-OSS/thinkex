"use client";

import { useEffect } from "react";
import { useSession, signIn } from "@/lib/auth-client";
import { SidebarProvider } from "@/components/ui/sidebar";

/**
 * Handles anonymous session creation and workspace access.
 * Creates anonymous session if needed, workspace creation happens lazily in WorkspaceGrid.
 * No loading screen - renders children immediately.
 */
export function AnonymousSessionHandler({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();

  useEffect(() => {
    // If no session and not loading, create anonymous session
    if (!isPending && !session) {
      signIn.anonymous().catch((error) => {
        console.error("Failed to create anonymous session:", error);
      });
    }
  }, [session, isPending]);

  // Always render children - no loading screen
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
