# Cloud Persistence

Thread and message persistence with assistant-cloud.

## Overview

Cloud persistence saves threads and messages to the assistant-ui cloud backend, enabling:
- Chat history across sessions
- Multi-device sync
- Thread management (archive, delete)
- Auto-generated titles

## Basic Setup

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
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
    cloud,  // Enable persistence
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadList />
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

## Thread API

### List Threads

```tsx
const threads = await cloud.threads.list({
  status: "active",     // "active" | "archived" | "all"
  limit: 50,
  offset: 0,
});

// threads: Array<{
//   id: string;
//   title: string;
//   created_at: Date;
//   updated_at: Date;
//   last_message_at: Date;
//   is_archived: boolean;
//   external_id?: string;
//   metadata?: unknown;
// }>
```

### Get Thread

```tsx
const thread = await cloud.threads.get(threadId);
```

### Create Thread

```tsx
const { thread_id } = await cloud.threads.create({
  title: "My New Chat",
  external_id: "custom-id-123",  // Optional external reference
  metadata: {                     // Optional custom data
    source: "web",
    category: "support",
  },
});
```

### Update Thread

```tsx
await cloud.threads.update(threadId, {
  title: "Updated Title",
  is_archived: true,
  metadata: { priority: "high" },
});
```

### Delete Thread

```tsx
await cloud.threads.delete(threadId);
```

## Message API

### List Messages

```tsx
const messages = await cloud.threads.messages(threadId).list({
  format: "aui/v0",  // Message format
});

// messages: Array<{
//   id: string;
//   parent_id: string | null;
//   format: string;
//   content: object;
//   height: number;
//   created_at: Date;
// }>
```

### Create Message

```tsx
await cloud.threads.messages(threadId).create({
  parent_id: null,  // Or parent message ID for branching
  format: "aui/v0",
  content: {
    role: "user",
    content: [{ type: "text", text: "Hello" }],
  },
});
```

## Message Format

assistant-ui uses `"aui/v0"` format:

```typescript
interface AUIv0Message {
  role: "user" | "assistant" | "system";
  content: MessagePart[];
  status?: "running" | "complete" | "incomplete" | "requires-action";
  attachments?: Attachment[];
}

type MessagePart =
  | { type: "text"; text: string }
  | { type: "image"; image: string }
  | {
      type: "tool-call";
      toolCallId: string;
      toolName: string;
      args: unknown;
      argsText: string;
      result?: unknown;
      isError?: boolean;
      artifact?: unknown;
    }
  | { type: "reasoning"; text: string }
  | {
      type: "source";
      sourceType: "url";
      id: string;
      url: string;
      title?: string;
    };
```

## Thread History Adapter

For custom persistence with useLocalRuntime:

```tsx
import { AssistantCloudThreadHistoryAdapter } from "assistant-cloud";

const historyAdapter = new AssistantCloudThreadHistoryAdapter(cloud, threadId);

const runtime = useLocalRuntime({
  model: myModel,
  adapters: {
    threadHistory: historyAdapter,
  },
});
```

## Auto-Save Behavior

When `cloud` is passed to runtime:

1. **New messages** are automatically saved
2. **Thread creation** happens on first message
3. **Thread metadata** (title, timestamps) updated automatically
4. **Message branching** (edits) preserved

## Thread Title Generation

Titles are auto-generated from conversation:

```tsx
// Manual trigger
const item = api.threads().item({ id: threadId });
await item.generateTitle();
```

The cloud backend uses the conversation to generate a concise title.

## External ID Mapping

Link threads to your system:

```tsx
// Create with external ID
await cloud.threads.create({
  external_id: "your-system-id-123",
});

// Find by external ID
const threads = await cloud.threads.list();
const thread = threads.find(t => t.external_id === "your-system-id-123");
```

## Metadata

Store custom data with threads:

```tsx
await cloud.threads.create({
  metadata: {
    userId: user.id,
    category: "sales",
    priority: 1,
    tags: ["important", "follow-up"],
  },
});

// Update metadata
await cloud.threads.update(threadId, {
  metadata: { resolved: true },
});
```

## Caching and Sync

Messages are loaded on thread switch:

```tsx
// Thread list is cached in memory
// Messages loaded when switching threads
api.threads().switchToThread(threadId);
```

For real-time sync across devices, implement webhook handlers on your backend.

## Error Handling

```tsx
try {
  const threads = await cloud.threads.list();
} catch (error) {
  if (error.status === 401) {
    // Auth expired - refresh token
    await refreshAuth();
  } else if (error.status === 429) {
    // Rate limited
    await delay(1000);
  }
}
```
