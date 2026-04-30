"use client";

import React, { createContext, useContext, useCallback, useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";

/**
 * WorkspaceContext is the single source of truth for the active workspace.
 *
 * State management responsibilities:
 * - Workspace list + active workspace + slug: WorkspaceContext (this file)
 * - Per-workspace persisted UI state (e.g. last thread): Zustand workspace-store
 * - Other UI state: Zustand ui-store
 * - Workspace items: Zero sync (via WorkspaceItemsProvider)
 */
interface WorkspaceContextType {
  // Workspace list
  workspaces: WorkspaceWithState[];
  loadingWorkspaces: boolean;
  loadWorkspaces: () => Promise<void>;
  updateWorkspaceLocal: (
    workspaceId: string,
    updates: Partial<WorkspaceWithState>,
  ) => void;

  // Current workspace (loaded by slug for direct access)
  currentWorkspace: WorkspaceWithState | null;
  currentWorkspaceId: string | null;
  loadingCurrentWorkspace: boolean;

  // Current slug (derived from URL)
  currentSlug: string | null;

  // Actions
  switchWorkspace: (slug: string) => void;
  deleteWorkspace: (workspaceId: string) => Promise<void>;
  leaveWorkspace: (workspaceId: string) => Promise<void>;
  markWorkspaceOpened: (workspaceId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({
  children,
  initialWorkspaces,
}: {
  children: React.ReactNode;
  initialWorkspaces?: WorkspaceWithState[] | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  // Derive current slug synchronously from pathname (no useEffect delay)
  const currentSlug = useMemo(() => {
    if (pathname.startsWith("/workspace/") && pathname !== "/workspace") {
      return pathname.replace("/workspace/", "");
    }
    return null;
  }, [pathname]);

  // Fetch full workspace list lazily (for sidebar, workspace switching)
  // This is deferred - not needed for initial workspace render
  const { data: workspacesData, isLoading: loadingWorkspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: async (): Promise<WorkspaceWithState[]> => {
      const response = await fetch("/api/workspaces");
      if (!response.ok) {
        throw new Error("Failed to fetch workspaces");
      }
      const data = await response.json();
      return data.workspaces || [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: 3,
    ...(initialWorkspaces !== null && initialWorkspaces !== undefined
      ? {
          initialData: initialWorkspaces,
          initialDataUpdatedAt: Date.now(),
        }
      : {}),
  });

  // Find cached workspace in list to use as initial data for instant loading
  const cachedWorkspace = useMemo(() => {
    if (!currentSlug || !workspacesData) return undefined;
    return workspacesData.find(
      (w: WorkspaceWithState) => w.slug === currentSlug,
    );
  }, [currentSlug, workspacesData]);

  // Fetch current workspace by slug (fast path for direct workspace access)
  // This loads only the workspace metadata needed, not the entire list or state
  // State is loaded separately by useWorkspaceState hook
  const { data: currentWorkspaceData, isLoading: loadingCurrentWorkspace } =
    useQuery({
      queryKey: ["workspace-by-slug", currentSlug],
      queryFn: async () => {
        if (!currentSlug) return null;
        const response = await fetch(`/api/workspaces/slug/${currentSlug}`);
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error("Failed to fetch workspace");
        }
        const data = await response.json();
        return data.workspace || null;
      },
      enabled: !!currentSlug,
      initialData: cachedWorkspace, // Use cached data from list if available
      initialDataUpdatedAt: cachedWorkspace ? Date.now() : undefined, // Treat as fresh
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      retry: 1, // Don't retry much for single workspace
    });

  const currentWorkspace = currentWorkspaceData || null;
  const currentWorkspaceId = currentWorkspace?.id ?? null;

  // Merge current workspace into list if not already present
  const workspaces = useMemo(() => {
    const list = workspacesData || [];
    // If we have a current workspace loaded by slug but it's not in the list yet,
    // add it so the UI can display it immediately
    if (
      currentWorkspace &&
      !list.some((w: WorkspaceWithState) => w.id === currentWorkspace.id)
    ) {
      return [currentWorkspace, ...list];
    }
    return list;
  }, [workspacesData, currentWorkspace]);

  // Load workspaces function for compatibility
  const loadWorkspaces = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  }, [queryClient]);

  // Switch workspace
  const switchWorkspace = useCallback(
    (slug: string) => {
      router.push(`/workspace/${slug}`);
    },
    [router],
  );

  // Delete workspace mutation
  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const response = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete workspace");
      }
      return workspaceId;
    },
    onSuccess: (deletedWorkspaceId) => {
      // Update cache immediately
      queryClient.setQueryData(
        ["workspaces"],
        (old: WorkspaceWithState[] | undefined) => {
          if (!old) return [];
          const remainingWorkspaces = old.filter(
            (w) => w.id !== deletedWorkspaceId,
          );

          // If we deleted the current workspace, switch to first available
          // Only switch if we are actively in that workspace (checked via currentSlug)
          if (deletedWorkspaceId === currentWorkspaceId && currentSlug) {
            if (remainingWorkspaces.length > 0) {
              switchWorkspace(
                remainingWorkspaces[0].slug || remainingWorkspaces[0].id,
              );
            } else {
              router.push("/home");
            }
          }

          return remainingWorkspaces;
        },
      );

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
    [deleteWorkspaceMutation],
  );

  // Leave workspace mutation (collaborator self-removal). Updates cache like
  // delete; on success navigates to /home when leaving the active workspace.
  const leaveWorkspaceMutation = useMutation({
    mutationFn: async (workspaceId: string) => {
      const response = await fetch(`/api/workspaces/${workspaceId}/leave`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to leave workspace");
      }
      return workspaceId;
    },
    onSuccess: (leftWorkspaceId) => {
      queryClient.setQueryData(
        ["workspaces"],
        (old: WorkspaceWithState[] | undefined) => {
          const remainingWorkspaces = (old ?? []).filter(
            (w) => w.id !== leftWorkspaceId,
          );

          if (leftWorkspaceId === currentWorkspaceId && currentSlug) {
            router.push("/home");
          }

          return remainingWorkspaces;
        },
      );

      toast.success("Left workspace successfully");
    },
    onError: () => {
      toast.error("Failed to leave workspace");
    },
  });

  const leaveWorkspace = useCallback(
    async (workspaceId: string) => {
      await leaveWorkspaceMutation.mutateAsync(workspaceId);
    },
    [leaveWorkspaceMutation],
  );

  // Optimistically update a single workspace locally without refetching
  const updateWorkspaceLocal = useCallback(
    (workspaceId: string, updates: Partial<WorkspaceWithState>) => {
      queryClient.setQueryData(
        ["workspaces"],
        (old: WorkspaceWithState[] | undefined) => {
          if (!old) return [];
          return old.map((w) =>
            w.id === workspaceId ? { ...w, ...updates } : w,
          );
        },
      );
    },
    [queryClient],
  );

  // Track workspace open with optimistic update
  const markWorkspaceOpened = useCallback(
    (workspaceId: string) => {
      // 1. Optimistic update: Move to top and update lastOpenedAt
      queryClient.setQueryData(
        ["workspaces"],
        (old: WorkspaceWithState[] | undefined) => {
          if (!old) return [];

          const now = new Date().toISOString();
          const workspaceIndex = old.findIndex((w) => w.id === workspaceId);

          if (workspaceIndex === -1) return old;

          const workspace = { ...old[workspaceIndex], lastOpenedAt: now };
          const newWorkspaces = [...old];

          // Remove from current position
          newWorkspaces.splice(workspaceIndex, 1);

          // Add to front (assuming recent first sort)
          newWorkspaces.unshift(workspace);

          return newWorkspaces;
        },
      );

      // 2. Fire and forget API call
      fetch(`/api/workspaces/${workspaceId}/track-open`, {
        method: "POST",
      }).catch((error) => {
        console.error("Failed to track workspace open:", error);
        // We could revert the optimistic update here if strict consistency is needed,
        // but for "recent workspaces" it's acceptable to keep it until next refetch.
      });
    },
    [queryClient],
  );

  const value: WorkspaceContextType = {
    workspaces,
    loadingWorkspaces,
    loadWorkspaces,
    updateWorkspaceLocal,
    currentWorkspace,
    currentWorkspaceId,
    loadingCurrentWorkspace,
    currentSlug,
    switchWorkspace,
    deleteWorkspace,
    leaveWorkspace,
    markWorkspaceOpened,
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
    throw new Error(
      "useWorkspaceContext must be used within WorkspaceProvider",
    );
  }
  return context;
}

/** Shorthand for `useWorkspaceContext().currentWorkspaceId`. */
export function useCurrentWorkspaceId(): string | null {
  return useWorkspaceContext().currentWorkspaceId;
}
