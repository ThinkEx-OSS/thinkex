import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { ChatMessage } from "./types";

/**
 * TanStack Query keys + hooks for thread CRUD and message history.
 * The chat stream itself is owned by `useChat` from `@ai-sdk/react`; TanStack Query
 * is only used for the thread list dropdown and the initial-history hydration.
 */

export interface ThreadListItem {
  id: string;
  title?: string;
  status: "regular" | "archived";
  externalId?: string;
}

export const chatQueryKeys = {
  threads: (workspaceId: string) => ["threads", workspaceId] as const,
  threadMessages: (threadId: string) => ["thread-messages", threadId] as const,
};

interface ThreadsResponse {
  threads: Array<{
    remoteId: string;
    status?: string;
    title?: string;
    externalId?: string;
  }>;
}

async function fetchThreads(workspaceId: string): Promise<ThreadListItem[]> {
  const res = await fetch(
    `/api/threads?workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to list threads: ${res.status}`);
  }
  const data = (await res.json()) as ThreadsResponse;
  return (data.threads ?? []).map((t) => ({
    id: t.remoteId,
    title: t.title,
    status: t.status === "archived" ? "archived" : "regular",
    externalId: t.externalId,
  }));
}

export function useThreadsQuery(
  workspaceId: string | null | undefined,
): UseQueryResult<ThreadListItem[], Error> {
  return useQuery({
    queryKey: chatQueryKeys.threads(workspaceId ?? ""),
    queryFn: () => fetchThreads(workspaceId as string),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });
}

interface MessagesResponse {
  messages: ChatMessage[];
}

export type ThreadMessagesHydrationResult =
  | { kind: "found"; messages: ChatMessage[] }
  | { kind: "missing"; messages: [] };

export async function fetchThreadMessages(
  threadId: string,
): Promise<ThreadMessagesHydrationResult> {
  const res = await fetch(
    `/api/threads/${encodeURIComponent(threadId)}/messages`,
  );
  if (!res.ok) {
    if (res.status === 404) return { kind: "missing", messages: [] };
    throw new Error(`Failed to load messages: ${res.status}`);
  }
  const data = (await res.json()) as MessagesResponse;
  return {
    kind: "found",
    messages: Array.isArray(data.messages) ? data.messages : [],
  };
}

export function useThreadMessagesQuery(
  threadId: string | null | undefined,
  enabled = true,
): UseQueryResult<ThreadMessagesHydrationResult, Error> {
  return useQuery({
    queryKey: chatQueryKeys.threadMessages(threadId ?? ""),
    queryFn: () => fetchThreadMessages(threadId as string),
    enabled: !!threadId && enabled,
    staleTime: 60_000,
  });
}

interface RenameVars {
  threadId: string;
  title: string;
}

export function useRenameThread(
  workspaceId: string,
): UseMutationResult<void, Error, RenameVars, { previous?: ThreadListItem[] }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, title }: RenameVars) => {
      const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`Rename failed: ${res.status}`);
    },
    onMutate: async ({ threadId, title }) => {
      const key = chatQueryKeys.threads(workspaceId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ThreadListItem[]>(key);
      queryClient.setQueryData<ThreadListItem[]>(key, (prev) =>
        prev?.map((t) => (t.id === threadId ? { ...t, title } : t)),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          chatQueryKeys.threads(workspaceId),
          ctx.previous,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.threads(workspaceId),
      });
    },
  });
}

export function useDeleteThread(
  workspaceId: string,
): UseMutationResult<void, Error, string, { previous?: ThreadListItem[] }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (threadId: string) => {
      const res = await fetch(`/api/threads/${encodeURIComponent(threadId)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    },
    onMutate: async (threadId) => {
      const key = chatQueryKeys.threads(workspaceId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ThreadListItem[]>(key);
      queryClient.setQueryData<ThreadListItem[]>(key, (prev) =>
        prev?.filter((t) => t.id !== threadId),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(
          chatQueryKeys.threads(workspaceId),
          ctx.previous,
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.threads(workspaceId),
      });
    },
  });
}

export function useArchiveThread(
  workspaceId: string,
): UseMutationResult<void, Error, { threadId: string; archive: boolean }> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ threadId, archive }) => {
      const res = await fetch(
        `/api/threads/${encodeURIComponent(threadId)}/${archive ? "archive" : "unarchive"}`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(`Archive toggle failed: ${res.status}`);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: chatQueryKeys.threads(workspaceId),
      });
    },
  });
}
