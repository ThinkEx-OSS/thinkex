"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceWithState, WorkspaceTemplate } from "@/lib/workspace-state/types";
import type { CardColor } from "@/lib/workspace-state/colors";
import type { AgentState } from "@/lib/workspace-state/types";

interface CreateWorkspaceParams {
  name: string;
  icon?: string | null;
  color?: CardColor | null;
  template?: WorkspaceTemplate;
  description?: string;
  is_public?: boolean;
  initialState?: AgentState;
}

interface CreateWorkspaceResponse {
  workspace: {
    id: string;
    slug: string;
    name: string;
    state?: {
      items?: Array<unknown>;
    };
  };
}

interface GenerateTitleParams {
  prompt: string;
}

interface GenerateTitleResponse {
  title: string;
  icon?: string;
  color?: string;
}

/**
 * Mutation hook for creating a workspace
 * Provides optimistic updates and automatic cache invalidation
 */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: CreateWorkspaceParams): Promise<CreateWorkspaceResponse> => {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create workspace");
      }

      return response.json();
    },

    onMutate: async (newWorkspace) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ["workspaces"] });

      // Snapshot the previous value for rollback
      const previous = queryClient.getQueryData<WorkspaceWithState[]>(["workspaces"]);

      // Optimistically add the new workspace to the list
      queryClient.setQueryData<WorkspaceWithState[]>(["workspaces"], (old) => {
        if (!old) return old;

        const optimisticWorkspace: WorkspaceWithState = {
          id: `temp-${Date.now()}`,
          slug: `temp-${Date.now()}`,
          name: newWorkspace.name,
          description: newWorkspace.description || "",
          template: newWorkspace.template || "blank",
          isPublic: newWorkspace.is_public || false,
          icon: newWorkspace.icon || null,
          color: newWorkspace.color || null,
          userId: "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sortOrder: old.length,
          lastOpenedAt: null,
        };

        return [optimisticWorkspace, ...old];
      });

      return { previous };
    },

    onError: (_err, _newWorkspace, context) => {
      // Rollback to previous state on error
      if (context?.previous) {
        queryClient.setQueryData(["workspaces"], context.previous);
      }
    },

    onSuccess: async () => {
      // Invalidate to get the real data from server
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });
}

/**
 * Mutation hook for generating a workspace title from a prompt
 */
export function useGenerateWorkspaceTitle() {
  return useMutation({
    mutationFn: async (params: GenerateTitleParams): Promise<GenerateTitleResponse> => {
      const response = await fetch("/api/workspaces/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate title");
      }

      return response.json();
    },
  });
}

/**
 * Combined hook for creating a workspace from a prompt
 * First generates title/icon/color, then creates the workspace
 */
export function useCreateWorkspaceFromPrompt() {
  const generateTitle = useGenerateWorkspaceTitle();
  const createWorkspace = useCreateWorkspace();

  const mutate = async (
    prompt: string,
    options?: {
      template?: WorkspaceTemplate;
      initialState?: AgentState;
      onSuccess?: (workspace: CreateWorkspaceResponse["workspace"]) => void;
      onError?: (error: Error) => void;
    }
  ) => {
    try {
      // Step 1: Generate title, icon, and color from prompt
      const { title, icon, color } = await generateTitle.mutateAsync({ prompt });

      // Step 2: Create the workspace with generated metadata
      const result = await createWorkspace.mutateAsync({
        name: title,
        icon: icon || null,
        color: (color as CardColor) || null,
        template: options?.template || "getting_started",
        initialState: options?.initialState,
      });

      options?.onSuccess?.(result.workspace);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Something went wrong");
      options?.onError?.(err);
      throw err;
    }
  };

  return {
    mutate,
    mutateAsync: mutate,
    isLoading: generateTitle.isPending || createWorkspace.isPending,
    isGeneratingTitle: generateTitle.isPending,
    isCreatingWorkspace: createWorkspace.isPending,
    error: generateTitle.error || createWorkspace.error,
    reset: () => {
      generateTitle.reset();
      createWorkspace.reset();
    },
  };
}
