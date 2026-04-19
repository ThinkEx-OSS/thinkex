import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ChatShell } from "@/components/chat-v2/shell";
import { DataStreamProvider } from "@/components/chat-v2/data-stream-provider";
import { ActiveChatProvider } from "@/hooks/chat-v2/use-active-chat";
import { auth } from "@/lib/auth";

export default async function ChatV2Layout({ children }: { children: ReactNode }) {
  const headersObj = await headers();
  const session = await auth.api.getSession({ headers: headersObj });

  if (!session?.user?.id) {
    redirect("/auth/sign-in");
  }

  return (
    <DataStreamProvider>
      <ActiveChatProvider>
        <ChatShell />
        {children}
      </ActiveChatProvider>
    </DataStreamProvider>
  );
}
