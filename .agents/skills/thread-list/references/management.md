# Thread List Management

CRUD operations for managing multiple chat threads.

## Overview

Thread list management allows users to:
- Create new conversations
- Switch between threads
- Rename, archive, and delete threads
- View thread history

## Accessing Thread List API

```tsx
import { useAssistantApi, useAssistantState } from "@assistant-ui/react";

function ThreadManager() {
  const api = useAssistantApi();

  // Get thread list API
  const threads = api.threads();

  // Get current state
  const { threads: threadIds, mainThreadId } = useAssistantState(
    (s) => s.threadList
  );
}
```

## Thread Operations

### Create New Thread

```tsx
const api = useAssistantApi();

// Switch to a new empty thread
await api.threads().switchToNewThread();

// Thread is created when first message is sent
```

### Switch Thread

```tsx
// By thread ID
await api.threads().switchToThread(threadId);

// Using item
const item = api.threads().item({ id: threadId });
await item.switchTo();
```

### Rename Thread

```tsx
const item = api.threads().item({ id: threadId });
await item.rename("New Chat Title");
```

### Archive Thread

```tsx
const item = api.threads().item({ id: threadId });
await item.archive();

// Archived threads move to archivedThreads list
```

### Unarchive Thread

```tsx
const item = api.threads().item({ id: threadId });
await item.unarchive();

// Moves back to regular threads list
```

### Delete Thread

```tsx
const item = api.threads().item({ id: threadId });
await item.delete();

// Permanently removes thread
// If deleting current thread, switches to another
```

### Generate Title

```tsx
const item = api.threads().item({ id: threadId });
await item.generateTitle();

// Uses AI to generate title from conversation
```

## Thread List State

```typescript
interface ThreadListState {
  mainThreadId: string;           // Current thread
  newThread: string | undefined;  // Pending new thread
  threads: readonly string[];     // Regular thread IDs
  archivedThreads: readonly string[];
  isLoading: boolean;
  threadItems: Record<string, ThreadListItemState>;
}

interface ThreadListItemState {
  id: string;
  title?: string;
  status: "regular" | "archived";
  isMain: boolean;  // Is current thread
}
```

## Subscribing to Changes

```tsx
import { useAssistantState, useAssistantEvent } from "@assistant-ui/react";

function ThreadWatcher() {
  // Reactive state
  const threads = useAssistantState((s) => s.threadList.threads);

  // Events
  useAssistantEvent("thread-started", () => {
    console.log("New thread created");
  });

  return <div>{threads.length} threads</div>;
}
```

## Item Access Patterns

```tsx
const api = useAssistantApi();
const threads = api.threads();

// By ID
const item1 = threads.item({ id: "thread-123" });

// By index (regular threads)
const item2 = threads.item({ index: 0 });

// By index (archived)
const item3 = threads.item({ index: 0, archived: true });

// Current thread
const mainItem = threads.item("main");
```

## Batch Operations

```tsx
async function archiveOldThreads(olderThan: Date) {
  const api = useAssistantApi();
  const { threads } = api.threads().getState();

  for (const threadId of threads) {
    const item = api.threads().item({ id: threadId });
    const state = item.getState();

    if (new Date(state.updatedAt) < olderThan) {
      await item.archive();
    }
  }
}
```

## Thread Data

Access thread metadata:

```tsx
const item = api.threads().item({ id: threadId });
const state = item.getState();

// {
//   id: "thread-123",
//   title: "Chat about React",
//   status: "regular",
//   isMain: true,
//   createdAt: Date,
//   updatedAt: Date,
// }
```

## Thread Initialization

When using cloud persistence, threads are lazily initialized:

```tsx
const item = api.threads().item({ id: localThreadId });

// Initialize creates remote mapping
const { remoteId, externalId } = await item.initialize();

// Now thread is persisted to cloud
```

## Error Handling

```tsx
async function safeDelete(threadId: string) {
  const api = useAssistantApi();
  const item = api.threads().item({ id: threadId });

  try {
    await item.delete();
  } catch (error) {
    if (error.message.includes("not found")) {
      // Thread already deleted
      return;
    }
    throw error;
  }
}
```

## Sorting and Filtering

Thread list is sorted by last activity. For custom sorting:

```tsx
function SortedThreadList({ sortBy }: { sortBy: "title" | "date" }) {
  const { threads } = useAssistantState((s) => s.threadList);
  const api = useAssistantApi();

  const sorted = [...threads].sort((a, b) => {
    const itemA = api.threads().item({ id: a }).getState();
    const itemB = api.threads().item({ id: b }).getState();

    if (sortBy === "title") {
      return (itemA.title || "").localeCompare(itemB.title || "");
    }
    return new Date(itemB.updatedAt) - new Date(itemA.updatedAt);
  });

  return (
    <div>
      {sorted.map((id) => (
        <ThreadListItem key={id} id={id} />
      ))}
    </div>
  );
}
```

## Keyboard Navigation

```tsx
function KeyboardNav() {
  const { threads, mainThreadId } = useAssistantState((s) => s.threadList);
  const api = useAssistantApi();

  const currentIndex = threads.indexOf(mainThreadId);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowUp" && currentIndex > 0) {
      api.threads().switchToThread(threads[currentIndex - 1]);
    }
    if (e.key === "ArrowDown" && currentIndex < threads.length - 1) {
      api.threads().switchToThread(threads[currentIndex + 1]);
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, threads]);

  return null;
}
```
