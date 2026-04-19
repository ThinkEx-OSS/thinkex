"use client";

import { useMutation, useQuery, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import {
  archiveThread,
  createThread,
  deleteThread,
  generateTitle,
  listThreads,
  patchThread,
  unarchiveThread,
} from "@/lib/chat/persistence";
import type { ThreadListItem, ThinkexUIMessage } from "@/lib/chat/types";

export function useThreadList(workspaceId: string | null) {
  return useQuery({
    queryKey: ["thread-list", workspaceId],
    queryFn: () => (workspaceId ? listThreads(workspaceId) : Promise.resolve([])),
    enabled: !!workspaceId,
  });
}

export function useCreateThread(
  workspaceId: string,
): UseMutationResult<
  { remoteId: string; externalId?: string },
  Error,
  { externalId?: string } | void
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (variables) => createThread(workspaceId, variables?.externalId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["thread-list", workspaceId],
      });
    },
  });
}

export function useRenameThread(
  workspaceId: string,
): UseMutationResult<void, Error, { threadId: string; title: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, title }) => patchThread(threadId, { title }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["thread-list", workspaceId],
      });
    },
  });
}

export function useArchiveThread(
  workspaceId: string,
): UseMutationResult<void, Error, { threadId: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId }) => archiveThread(threadId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["thread-list", workspaceId],
      });
    },
  });
}

export function useUnarchiveThread(
  workspaceId: string,
): UseMutationResult<void, Error, { threadId: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId }) => unarchiveThread(threadId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["thread-list", workspaceId],
      });
    },
  });
}

export function useDeleteThread(
  workspaceId: string,
): UseMutationResult<void, Error, { threadId: string }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId }) => deleteThread(threadId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["thread-list", workspaceId],
      });
    },
  });
}

export function useGenerateTitle(
  workspaceId: string,
): UseMutationResult<
  string,
  Error,
  { threadId: string; messages: ThinkexUIMessage[] }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ threadId, messages }) => generateTitle(threadId, messages),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["thread-list", workspaceId],
      });
    },
  });
}

export function getActiveThread(
  threads: ThreadListItem[],
  threadId: string | null,
): ThreadListItem | null {
  if (threadId) {
    return threads.find((thread) => thread.remoteId === threadId) ?? null;
  }

  return threads[0] ?? null;
}
