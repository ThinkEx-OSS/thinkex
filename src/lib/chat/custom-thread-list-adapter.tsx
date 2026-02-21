"use client";

import { type FC, type PropsWithChildren, useMemo } from "react";
import {
  type ThreadMessage,
  type unstable_RemoteThreadListAdapter as RemoteThreadListAdapter,
  RuntimeAdapterProvider,
} from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import { useCustomThreadHistoryAdapter } from "./custom-thread-history-adapter";
import { SupabaseAttachmentAdapter } from "@/lib/attachments/supabase-attachment-adapter";

const attachmentsInstance = new SupabaseAttachmentAdapter();

function CustomThreadListProviderInner({
  children,
}: PropsWithChildren) {
  const history = useCustomThreadHistoryAdapter();
  const adapters = useMemo(
    () => ({
      history,
      attachments: attachmentsInstance,
    }),
    [history]
  );
  return (
    <RuntimeAdapterProvider adapters={adapters}>
      {children}
    </RuntimeAdapterProvider>
  );
}

export function createThreadListAdapter(
  workspaceId: string
): RemoteThreadListAdapter {
  const unstable_Provider: FC<PropsWithChildren> = function CustomThreadListProvider({
    children,
  }) {
    return <CustomThreadListProviderInner>{children}</CustomThreadListProviderInner>;
  };

  return {
    async list() {
      const res = await fetch(`/api/threads?workspaceId=${workspaceId}`);
      if (!res.ok) throw new Error(`Failed to list threads: ${res.status}`);
      const data = await res.json();
      return {
        threads: (data.threads ?? []).map((t: { remoteId: string; status?: string; title?: string; externalId?: string }) => ({
          remoteId: t.remoteId,
          status: t.status ?? "regular",
          title: t.title,
          externalId: t.externalId,
        })),
      };
    },

    async initialize(_localId: string) {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? `Failed to create thread: ${res.status}`);
      }
      const data = await res.json();
      return {
        remoteId: data.remoteId ?? data.id,
        externalId: data.externalId,
      };
    },

    async rename(remoteId: string, title: string) {
      const res = await fetch(`/api/threads/${remoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error(`Failed to rename: ${res.status}`);
    },

    async archive(remoteId: string) {
      const res = await fetch(`/api/threads/${remoteId}/archive`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Failed to archive: ${res.status}`);
    },

    async unarchive(remoteId: string) {
      const res = await fetch(`/api/threads/${remoteId}/unarchive`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Failed to unarchive: ${res.status}`);
    },

    async delete(remoteId: string) {
      const res = await fetch(`/api/threads/${remoteId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Failed to delete: ${res.status}`);
    },

    async fetch(remoteId: string) {
      const res = await fetch(`/api/threads/${remoteId}`);
      if (!res.ok) throw new Error(`Failed to fetch thread: ${res.status}`);
      const data = await res.json();
      return {
        remoteId: data.remoteId ?? data.id,
        status: data.status ?? "regular",
        title: data.title,
        externalId: data.externalId,
      };
    },

    async generateTitle(
      remoteId: string,
      messages: readonly ThreadMessage[]
    ) {
      return createAssistantStream(async (controller) => {
        const res = await fetch(`/api/threads/${remoteId}/title`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages }),
        });
        if (!res.ok) {
          controller.appendText("New Chat");
          return;
        }
        const data = await res.json();
        controller.appendText(data.title ?? "New Chat");
      });
    },

    unstable_Provider,
  };
}
