---
name: cloud
description: Guide for assistant-cloud persistence and authorization. Use when setting up thread persistence, file uploads, or authentication.
version: 0.0.1
license: MIT
---

# assistant-ui Cloud

**Always consult [assistant-ui.com/llms.txt](https://assistant-ui.com/llms.txt) for latest API.**

Cloud persistence for threads, messages, and files.

## References

- [./references/persistence.md](./references/persistence.md) -- Thread and message persistence
- [./references/authorization.md](./references/authorization.md) -- Authentication patterns

## Installation

```bash
npm install assistant-cloud
```

## Quick Start

```tsx
import { AssistantCloud } from "assistant-cloud";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";
import { AssistantRuntimeProvider, Thread, ThreadList } from "@assistant-ui/react";

const cloud = new AssistantCloud({
  baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
  authToken: async () => getAuthToken(),
});

function Chat() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
    cloud,
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadList />
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

## Authentication Options

```tsx
// JWT Token (recommended)
const cloud = new AssistantCloud({
  baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
  authToken: async () => session?.accessToken,
});

// API Key (server-side)
const cloud = new AssistantCloud({
  baseUrl: process.env.ASSISTANT_BASE_URL,
  apiKey: process.env.ASSISTANT_API_KEY,
  userId: user.id,
  workspaceId: user.workspaceId,
});

// Anonymous (public apps)
const cloud = new AssistantCloud({
  baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
  anonymous: true,
});
```

## Cloud API

```tsx
// Thread operations
const threads = await cloud.threads.list();
await cloud.threads.create({ title: "New Chat" });
await cloud.threads.update(threadId, { title: "Updated" });
await cloud.threads.delete(threadId);

// Message operations
const messages = await cloud.threads.messages(threadId).list();

// File uploads
const { signedUrl, publicUrl } = await cloud.files.generatePresignedUploadUrl({
  filename: "document.pdf",
});
await fetch(signedUrl, { method: "PUT", body: file });
```

## Environment Variables

```env
NEXT_PUBLIC_ASSISTANT_BASE_URL=https://api.assistant-ui.com
ASSISTANT_API_KEY=your-api-key  # Server-side only
```

## Common Gotchas

**Threads not persisting**
- Pass `cloud` to runtime
- Check authentication

**Auth errors**
- Verify `authToken` returns valid token
- Check `baseUrl` is correct
