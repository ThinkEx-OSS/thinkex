"use client";

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();

  const [isCreatingWelcomeWorkspace, setIsCreatingWelcomeWorkspace] = useState(false);

  // Derive current slug synchronously from pathname (no useEffect delay)
  const currentSlug = useMemo(() => {
    if (pathname.startsWith("/workspace/") && pathname !== "/workspace") {
      return pathname.replace("/workspace/", "");
    }
    // Backwards compatibility: also check /dashboard/
    if (pathname.startsWith("/dashboard/") && pathname !== "/dashboard") {
      return pathname.replace("/dashboard/", "");
    }
    return null;
  }, [pathname]);

  // Fetch workspaces with TanStack Query
  const { data: workspacesData, isLoading: loadingWorkspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const response = await fetch("/api/workspaces");
      if (!response.ok) {
        throw new Error('Failed to fetch workspaces');
      }
      const data = await response.json();
      return data.workspaces || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
  });

  const workspaces = workspacesData || [];

  // Load workspaces function for compatibility
  const loadWorkspaces = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
  }, [queryClient]);

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
        // Redirect to home (workspace is created but user goes to home)
        router.push("/home");
      } else {
        console.error("[WORKSPACE CONTEXT] Failed to create welcome workspace");
      }
    } catch (error) {
      console.error("[WORKSPACE CONTEXT] Error creating welcome workspace:", error);
    } finally {
      setIsCreatingWelcomeWorkspace(false);
    }
  }, [isCreatingWelcomeWorkspace, loadWorkspaces, router]);

  // TanStack Query automatically fetches on mount, no need for manual trigger

  // Note: Welcome workspace creation is now handled lazily in WorkspaceGrid
  // This prevents jarring dashboard flash and provides better UX

  // Switch workspace
  const switchWorkspace = useCallback(
    (slug: string) => {
      router.push(`/workspace/${slug}`);
    },
    [router]
  );

  // Delete workspace mutation
  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error('Failed to delete workspace');
      }
      return workspaceId;
    },
    onSuccess: (deletedWorkspaceId) => {
      // Update cache immediately
      queryClient.setQueryData(['workspaces'], (old: WorkspaceWithState[] | undefined) => {
        if (!old) return [];
        const remainingWorkspaces = old.filter((w) => w.id !== deletedWorkspaceId);
        
        // If we deleted the current workspace, switch to first available
        if (deletedWorkspaceId === currentWorkspaceId) {
          if (remainingWorkspaces.length > 0) {
            switchWorkspace(remainingWorkspaces[0].slug || remainingWorkspaces[0].id);
          } else {
            router.push("/home");
          }
        }
        
        return remainingWorkspaces;
      });
      
      toast.success("Workspace deleted successfully");
    },
    onError: () => {
      toast.error("Failed to delete workspace");
    },
  });

  // Delete workspace
  const deleteWorkspace = useCallback(
    async (workspaceId: string) => {
      await deleteWorkspaceMutation.mutateAsync(workspaceId);
    },
    [deleteWorkspaceMutation]
  );

  // Optimistically update a single workspace locally without refetching
  const updateWorkspaceLocal = useCallback((workspaceId: string, updates: Partial<WorkspaceWithState>) => {
    queryClient.setQueryData(['workspaces'], (old: WorkspaceWithState[] | undefined) => {
      if (!old) return [];
      return old.map((w) => (w.id === workspaceId ? { ...w, ...updates } : w));
    });
  }, [queryClient]);

  // Reorder workspaces mutation
  const reorderWorkspacesMutation = useMutation({
    mutationFn: async (workspaceIds: string[]) => {
      const response = await fetch("/api/workspaces/reorder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ workspaceIds }),
      });
      if (!response.ok) {
        throw new Error('Failed to reorder workspaces');
      }
      return workspaceIds;
    },
    onMutate: async (workspaceIds) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['workspaces'] });
      
      // Snapshot the previous value
      const previousWorkspaces = queryClient.getQueryData(['workspaces']) as WorkspaceWithState[] | undefined;
      
      // Optimistically update
      queryClient.setQueryData(['workspaces'], (old: WorkspaceWithState[] | undefined) => {
        if (!old) return [];
        // Reorder workspaces based on new order
        const reordered = workspaceIds
          .map((id) => old.find((w) => w.id === id))
          .filter((w): w is WorkspaceWithState => w !== undefined);

        // Add any workspaces not in the reorder list (shouldn't happen, but safety)
        const missing = old.filter((w) => !workspaceIds.includes(w.id));

        return [...reordered, ...missing];
      });
      
      return { previousWorkspaces };
    },
    onError: (err, workspaceIds, context) => {
      // Revert on error
      if (context?.previousWorkspaces) {
        queryClient.setQueryData(['workspaces'], context.previousWorkspaces);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  // Reorder workspaces
  const reorderWorkspaces = useCallback(
    async (workspaceIds: string[]) => {
      reorderWorkspacesMutation.mutate(workspaceIds);
    },
    [reorderWorkspacesMutation]
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

