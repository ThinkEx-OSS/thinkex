"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn } from "@/lib/auth-client";
import SharedWorkspaceModal from "@/components/workspace/SharedWorkspaceModal";
import { AuthPageBackground } from "@/components/auth/AuthPageBackground";
import { Loader2 } from "lucide-react";
import { usePostHog } from 'posthog-js/react';
import type { AgentState } from "@/lib/workspace-state/types";
import type { CardColor } from "@/lib/workspace-state/colors";

interface SharedWorkspaceData {
  workspace: {
    id: string;
    name: string;
    description: string;
    icon: string | null;
    color: CardColor | null;
    state: AgentState;
  };
}

/**
 * Share page with branching logic:
 * - Authenticated users: Show existing modal to import workspace (opt-in)
 * - Anonymous users: Automatically sign in & import workspace (frictionless)
 * 
 * We wait for the session to load first (isPending === false), then decide:
 * - If logged in with regular account: show modal
 * - If anonymous or no session: auto-import (signing in anonymously if needed)
 */
export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const posthog = usePostHog();
  const { data: session, isPending } = useSession();
  const workspaceId = params?.id as string;

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasSignedInRef = useRef(false);
  const hasImportedRef = useRef(false);

  // Effect 1: Sign in anonymously if no session exists
  // This only triggers the sign-in, doesn't do the import
  useEffect(() => {
    // Wait for session check to complete
    if (isPending) return;

    // If already signed in (any type), do nothing
    if (session) return;

    // Prevent double sign-in attempts
    if (hasSignedInRef.current) return;
    hasSignedInRef.current = true;

    setIsProcessing(true);
    signIn.anonymous().catch((error) => {
      console.error("Anonymous sign-in failed:", error);
      setErrorMessage("Failed to create temporary session");
      setIsProcessing(false);
    });
  }, [session, isPending]);

  // Effect 2: Perform import when session is anonymous
  // This runs after sign-in completes and session updates
  useEffect(() => {
    // Wait for session to be available
    if (isPending) return;
    if (!session) return;

    // Only import for anonymous users
    if (!session.user.isAnonymous) return;

    // Prevent double import
    if (hasImportedRef.current) return;
    hasImportedRef.current = true;

    const performImport = async () => {
      setIsProcessing(true);

      try {
        // 1. Fetch shared workspace data
        const shareRes = await fetch(`/api/share/${workspaceId}`);
        if (!shareRes.ok) throw new Error("Failed to load shared workspace");
        const shareData = await shareRes.json() as SharedWorkspaceData;

        // 2. Create copy in user's account
        const createRes = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: shareData.workspace.name,
            template: "blank",
            is_public: false,
            icon: shareData.workspace.icon,
            color: shareData.workspace.color,
            initialState: shareData.workspace.state,
          }),
        });

        if (!createRes.ok) throw new Error("Failed to create workspace copy");
        const { workspace } = await createRes.json();

        // 3. Track and Redirect
        posthog.capture('workspace-imported-anonymous', {
          workspace_id: workspace.id,
          source_workspace_id: workspaceId,
        });

        window.location.href = `/dashboard/${workspace.slug}`;

      } catch (error) {
        console.error("Auto-import failed:", error);
        setErrorMessage((error as Error).message || "Failed to load this workspace");
        setIsProcessing(false);
      }
    };

    performImport();
  }, [session, isPending, workspaceId, posthog]);

  // Error state with retry button
  if (errorMessage) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
        <AuthPageBackground />
        <div className="relative z-10 text-center space-y-6 max-w-md">
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
        </div>
      </main>
    );
  }

  // Loading / Processing State
  if (isProcessing) {
    return (
      <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
        <AuthPageBackground />
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

  // AUTHENTICATED (NON-ANONYMOUS) USER: Show existing modal flow
  // We opt to keep the modal for regular users to avoid polluting their account without consent
  if (session && !session.user.isAnonymous) {
    const handleModalClose = (open: boolean) => {
      if (!open) {
        // Redirect to dashboard when modal is closed without importing
        router.push("/dashboard");
      }
    };

    return (
      <>
        <AuthPageBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          {workspaceId && (
            <SharedWorkspaceModal
              open={true}
              onOpenChange={handleModalClose}
              workspaceId={workspaceId}
            />
          )}
        </div>
      </>
    );
  }

  // Initial loading state before effect runs
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
      <AuthPageBackground />
      <div className="relative z-10 text-center space-y-6 max-w-md">
        <div className="flex justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-white" />
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
          Loading...
        </h1>
      </div>
    </main>
  );
}
