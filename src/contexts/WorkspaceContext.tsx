"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useSession } from "@/lib/auth-client";

/**
 * Simplified WorkspaceContext - ONLY manages workspace list
 * 
 * State management responsibilities:
 * - Workspace list: WorkspaceContext (this file)
 * - Current workspace & save status: Zustand (workspace-store.ts)
 * - UI state: Zustand (ui-store.ts)
 * - Workspace data: Event sourcing + React Query
 */
interface WorkspaceContextType {
  // Workspace list
  workspaces: WorkspaceWithState[];
  loadingWorkspaces: boolean;
  loadWorkspaces: () => Promise<void>;
  updateWorkspaceLocal: (workspaceId: string, updates: Partial<WorkspaceWithState>) => void;

  // Current slug (derived from URL)
  currentSlug: string | null;

  // Actions
  switchWorkspace: (slug: string) => void;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  reorderWorkspaces: (workspaceIds: string[]) => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const { data: session } = useSession();

  // Workspace list state
  const [workspaces, setWorkspaces] = useState<WorkspaceWithState[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [isCreatingWelcomeWorkspace, setIsCreatingWelcomeWorkspace] = useState(false);

  // Derive current slug synchronously from pathname (no useEffect delay)
  const currentSlug = useMemo(() => {
    if (pathname.startsWith("/dashboard/") && pathname !== "/dashboard") {
      return pathname.replace("/dashboard/", "");
    }
    return null;
  }, [pathname]);

  // Load workspaces from API
  const loadWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    try {
      const response = await fetch("/api/workspaces");
      if (response.ok) {
        const data = await response.json();
        setWorkspaces(data.workspaces || []);
      }
    } catch (error) {
      console.error("[WORKSPACE CONTEXT] Error loading workspaces:", error);
    } finally {
      setLoadingWorkspaces(false);
    }
  }, []);

  // Create welcome workspace for anonymous users
  const createWelcomeWorkspace = useCallback(async () => {
    if (isCreatingWelcomeWorkspace) return;

    setIsCreatingWelcomeWorkspace(true);
    try {
      const response = await fetch("/api/guest/create-welcome-workspace", {
        method: "POST",
      });

      if (response.ok) {
        const data = await response.json();
        // Reload workspaces to get the new one
        await loadWorkspaces();
        // Redirect to the new workspace
        if (data.slug) {
          router.push(`/dashboard/${data.slug}`);
        }
      } else {
        console.error("[WORKSPACE CONTEXT] Failed to create welcome workspace");
      }
    } catch (error) {
      console.error("[WORKSPACE CONTEXT] Error creating welcome workspace:", error);
    } finally {
      setIsCreatingWelcomeWorkspace(false);
    }
  }, [isCreatingWelcomeWorkspace, loadWorkspaces, router]);

  // Load workspaces on mount
  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Note: Welcome workspace creation is now handled by /guest-setup page
  // This prevents jarring dashboard flash

  // Switch workspace
  const switchWorkspace = useCallback(
    (slug: string) => {
      router.push(`/dashboard/${slug}`);
    },
    [router]
  );

  // Delete workspace
  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      try {
        const response = await fetch(`/api/workspaces/${workspaceId}`, {
          method: "DELETE",
        });

        if (response.ok) {
          // Update local state immediately
          const remainingWorkspaces = workspaces.filter((w) => w.id !== workspaceId);
          setWorkspaces(remainingWorkspaces);

          // If we deleted the current workspace, switch to first available
          if (workspaceId === currentWorkspaceId) {
            if (remainingWorkspaces.length > 0) {
              switchWorkspace(remainingWorkspaces[0].slug || remainingWorkspaces[0].id);
            } else {
              router.push("/home");
            }
          }

          toast.success("Workspace deleted successfully");
        } else {
          toast.error("Failed to delete workspace");
        }
      } catch (error) {
        console.error("[WORKSPACE CONTEXT] Error deleting workspace:", error);
        toast.error("Failed to delete workspace");
      }
    },
    [workspaces, switchWorkspace, router, currentWorkspaceId]
  );

  // Optimistically update a single workspace locally without refetching
  const updateWorkspaceLocal = useCallback((workspaceId: string, updates: Partial<WorkspaceWithState>) => {
    setWorkspaces((prev) => prev.map((w) => (w.id === workspaceId ? { ...w, ...updates } : w)));
  }, []);

  // Reorder workspaces
  const reorderWorkspaces = useCallback(
    async (workspaceIds: string[]) => {
      try {
        // Optimistically update local state
        setWorkspaces((prev) => {
          // Reorder workspaces based on new order
          const reordered = workspaceIds
            .map((id) => prev.find((w) => w.id === id))
            .filter((w): w is WorkspaceWithState => w !== undefined);

          // Add any workspaces not in the reorder list (shouldn't happen, but safety)
          const missing = prev.filter((w) => !workspaceIds.includes(w.id));

          return [...reordered, ...missing];
        });

        // Persist to backend
        const response = await fetch("/api/workspaces/reorder", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ workspaceIds }),
        });

        if (!response.ok) {
          // Revert on error by reloading
          loadWorkspaces();
        }
      } catch (error) {
        console.error("[WORKSPACE CONTEXT] Error reordering workspaces:", error);
        // Revert on error by reloading
        loadWorkspaces();
      }
    },
    [loadWorkspaces, workspaces]
  );

  const value: WorkspaceContextType = {
    workspaces,
    loadingWorkspaces,
    loadWorkspaces,
    updateWorkspaceLocal,
    currentSlug,
    switchWorkspace,
    deleteWorkspace,
    reorderWorkspaces,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceContext() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceContext must be used within WorkspaceProvider");
  }
  return context;
}

