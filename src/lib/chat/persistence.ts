import type { ThreadListItem, StoredMessage } from "./types";
import { STORAGE_FORMAT } from "./types";

type F = typeof fetch;

async function parseErrorResponse(res: Response): Promise<never> {
  try {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error || `Request failed: ${res.status}`);
  } catch (error) {
    if (error instanceof Error && error.message) {
      throw error;
    }
    throw new Error(`Request failed: ${res.status}`);
  }
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  await parseErrorResponse(res);
}

export async function listThreads(
  workspaceId: string,
  f: F = fetch,
): Promise<ThreadListItem[]> {
  const res = await f(`/api/threads?workspaceId=${encodeURIComponent(workspaceId)}`);
  await ensureOk(res);
  const body = (await res.json()) as { threads: ThreadListItem[] };
  return body.threads;
}

export async function createThread(
  workspaceId: string,
  externalId?: string,
  f: F = fetch,
): Promise<{ remoteId: string; externalId?: string }> {
  const res = await f("/api/threads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspaceId, externalId }),
  });
  await ensureOk(res);
  const body = (await res.json()) as {
    remoteId: string;
    externalId?: string;
  };
  return {
    remoteId: body.remoteId,
    externalId: body.externalId,
  };
}

export async function fetchThread(
  remoteId: string,
  f: F = fetch,
): Promise<ThreadListItem> {
  const res = await f(`/api/threads/${encodeURIComponent(remoteId)}`);
  await ensureOk(res);
  return (await res.json()) as ThreadListItem;
}

export async function patchThread(
  remoteId: string,
  body: { title?: string; headMessageId?: string | null },
  f: F = fetch,
): Promise<void> {
  const res = await f(`/api/threads/${encodeURIComponent(remoteId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await ensureOk(res);
}

export async function deleteThread(
  remoteId: string,
  f: F = fetch,
): Promise<void> {
  const res = await f(`/api/threads/${encodeURIComponent(remoteId)}`, {
    method: "DELETE",
  });
  await ensureOk(res);
}

export async function archiveThread(
  remoteId: string,
  f: F = fetch,
): Promise<void> {
  const res = await f(`/api/threads/${encodeURIComponent(remoteId)}/archive`, {
    method: "POST",
  });
  await ensureOk(res);
}

export async function unarchiveThread(
  remoteId: string,
  f: F = fetch,
): Promise<void> {
  const res = await f(`/api/threads/${encodeURIComponent(remoteId)}/unarchive`, {
    method: "POST",
  });
  await ensureOk(res);
}

export async function loadMessages(
  remoteId: string,
  format: string = STORAGE_FORMAT,
  f: F = fetch,
): Promise<{ messages: StoredMessage[]; headId: string | null }> {
  const params = new URLSearchParams({ format });
  const res = await f(`/api/threads/${encodeURIComponent(remoteId)}/messages?${params.toString()}`);
  await ensureOk(res);
  const body = (await res.json()) as {
    messages: StoredMessage[];
    headId?: string;
  };
  return {
    messages: body.messages,
    headId: body.headId ?? null,
  };
}

export async function appendMessage(
  remoteId: string,
  body: { messageId: string; parentId: string | null; format: string; content: Record<string, unknown> },
  f: F = fetch,
): Promise<void> {
  const res = await f(`/api/threads/${encodeURIComponent(remoteId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  await ensureOk(res);
}

export async function patchMessage(
  remoteId: string,
  messageId: string,
  content: Record<string, unknown>,
  f: F = fetch,
): Promise<void> {
  const res = await f(
    `/api/threads/${encodeURIComponent(remoteId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }
  );
  await ensureOk(res);
}

export async function generateTitle(
  remoteId: string,
  messages: unknown[],
  f: F = fetch,
): Promise<string> {
  const res = await f(`/api/threads/${encodeURIComponent(remoteId)}/title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  await ensureOk(res);
  const body = (await res.json()) as { title: string };
  return body.title;
}
