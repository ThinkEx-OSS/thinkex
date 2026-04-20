import type { BranchSiblingsResponse } from "./types";

export async function fetchBranches(threadId: string, messageId: string) {
  const response = await fetch(
    `/api/threads/${threadId}/messages/${messageId}/branches`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return (await response.json()) as BranchSiblingsResponse;
}

export async function switchBranch(
  threadId: string,
  messageId: string,
  targetBranchId: string,
) {
  const response = await fetch(
    `/api/threads/${threadId}/messages/${messageId}/branches`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetBranchId }),
    },
  );

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

export async function editBranchMessage(
  threadId: string,
  messageId: string,
  text: string,
): Promise<{ newMessageId: string }> {
  const response = await fetch("/api/chat-v2/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ threadId, messageId, text }),
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}
