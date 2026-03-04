# Thread History Adapter Audit

Audit of your custom thread history adapter vs. assistant-ui's reference implementations.

**Sources**: [assistant-ui repo](https://github.com/assistant-ui/assistant-ui) (cloned for audit)  
**Your implementation**: `src/lib/chat/custom-thread-history-adapter.tsx`

---

## Architecture Overview

| Layer | Assistant-UI | Your Setup |
|-------|--------------|------------|
| Runtime | `useExternalStoreRuntime` + `useAISDKRuntime` | `useRemoteThreadListRuntime` + `useChatRuntime` |
| History flow | `useExternalHistory` → `historyAdapter.withFormat()` | Same (via `RuntimeAdapterProvider` + `adapters.history`) |
| Format | `aiSDKV6FormatAdapter` | Same (`ai-sdk/v6`) |

---

## Differences & Inconsistencies

### 1. **Missing `headId` in Load Response**

**Assistant-UI expectation** (`packages/core/src/adapters/thread-history.ts`):
```ts
export interface MessageFormatRepository<TMessage> {
  headId?: string | null;  // Optional but used
  messages: MessageFormatItem<TMessage>[];
}
```

**`toExportedMessageRepository`** (`packages/react-ai-sdk/src/ui/use-chat/useExternalHistory.ts`):
```ts
return {
  headId: messages.headId!,  // Non-null assertion; undefined if not set
  messages: messages.messages.map(...)
};
```

**`MessageRepository.import`** falls back when `headId` is missing:
```ts
this.resetHead(headId ?? messages.at(-1)?.message.id ?? null);
```

**Your implementation**: `load()` returns `{ messages: [...] }` with no `headId`.

**Impact**: For linear threads, the last message in your topological sort is used as head, so this works. For branched threads, the head should be the tip of the current branch, which your API does not currently return.

**Action**: Low priority for linear threads; consider adding `headId` if you use branching.

---

### 2. **Missing `update()` Implementation**

**Assistant-UI**: `GenericThreadHistoryAdapter` supports optional `update()` for in-place changes (e.g. streaming updates).

**Cloud reference** (`packages/react/src/legacy-runtime/cloud/AssistantCloudThreadHistoryAdapter.ts`):
```ts
async update(item, localMessageId) {
  await formatted.update?.(remoteId, item, localMessageId);
}
```

**`useExternalHistory`** calls `update` when:
- A message is already in `historyIds`
- `durationMs` is defined (run finished)

It updates each inner message with the latest content from the runtime.

**Your implementation**: No `update` in `withFormat`; only `append` and `load`.

**Impact**:
- New messages are persisted via `append` after a run.
- Streaming updates (partial assistant messages) are not written to the DB during the run.
- After completion, the final message is appended, so end state is saved.
- Telemetry (e.g. step timestamps) is not persisted via `update`.

**You have** `PATCH /api/threads/[id]/messages/[messageId]` but it is not used by the adapter.

**Action**: Add `update` to your `withFormat` and call your PATCH endpoint so streaming updates (and telemetry) are persisted.

---

### 3. **Missing `reportTelemetry()`**

**Assistant-UI**: Optional `reportTelemetry(items, options)` for run analytics (duration, step timestamps).

**Cloud reference**: Implements it and forwards to `runs.report()`.

**Your implementation**: Not implemented.

**Impact**: No run-level analytics from the history adapter. Likely fine unless you want run metrics.

---

### 4. **Message Order: Topological Sort vs. Reverse**

**Your approach**: `sortParentsBeforeChildren()` (topological sort) so parents always come before children for `MessageRepository.import()`.

**Assistant Cloud** (`packages/cloud/src/FormattedCloudPersistence.ts`):
```ts
return {
  messages: messages
    .filter(...)
    .map(...)
    .reverse()  // Simple reverse
};
```

**Impact**: Your sort is more robust for branching; Cloud’s `.reverse()` assumes a specific DB ordering (e.g. newest-first). Your ordering is correct.

---

### 5. **Storage Entry Shape**

**Assistant-UI** `MessageStorageEntry`:
```ts
{ id, parent_id, format, content }
```

**Your API**: Same shape (`id`, `parent_id`, `format`, `content`, `created_at`).

**Your decode** maps `parent_id` → `parentId` and `content` → message content, which matches `aiSDKV6FormatAdapter.decode()`.

---

### 6. **`load()` Early Exit When No `remoteId`**

**Assistant-UI** `useExternalHistory`:
```ts
if (!optionalThreadListItem()?.getState().remoteId) {
  setIsLoading(false);
  return;
}
loadHistory();
```

**Your `load()`**:
```ts
const remoteId = aui.threadListItem().getState().remoteId;
if (!remoteId) return { messages: [] };
```

**Impact**: Both guard against loading when there is no thread. Your behavior is consistent.

---

### 7. **`append` API Shape**

**Your POST body**: `{ messageId, parentId, format, content }`

**Cloud create**: `{ parent_id, format, content }` — no explicit message id; Cloud likely generates it.

**AI SDK format**: Uses `formatAdapter.getId(item.message)` for `messageId`. Your shape matches what the adapter provides.

---

### 8. **`created_at` Handling**

**Your implementation**: Uses `created_at` from the API for topological sort. Falls back to `new Date().toISOString()` when missing.

**Cloud**: `CloudMessage` has `created_at`; ordering may be done by the API.

**Impact**: Your fallback is reasonable; ensure your API returns `created_at` consistently.

---

## Summary Table

| Feature | Assistant-UI / Cloud | Your Implementation | Status |
|---------|----------------------|---------------------|--------|
| `load()` with parentId | ✓ | ✓ | ✓ Aligned |
| Topological sort | Cloud uses reverse | ✓ Topological sort | ✓ More robust |
| `headId` in load | Optional, used when branching | ✓ Persisted per thread, API returns it | ✓ Implemented |
| `append()` | ✓ | ✓ | ✓ Aligned |
| `update()` | ✓ Cloud implements | ✓ PATCH endpoint wired | ✓ Implemented |
| `reportTelemetry()` | ✓ Cloud implements | ✓ No-op (extensible) | ✓ Implemented |
| Storage format (ai-sdk/v6) | ✓ | ✓ | ✓ Aligned |
| Format filtering | ✓ | ✓ | ✓ Aligned |

---

## Completed Changes (Applied)

1. **`update()`** – Implemented; calls `PATCH /api/threads/{remoteId}/messages/{messageId}` with encoded content for streaming updates and step telemetry.

2. **`headId`** – Full branching support: `head_message_id` on `chat_threads`, set on append, returned from GET, preferred in adapter. PATCH `/api/threads/:id` accepts `headMessageId` for branch-switch persistence.

3. **`reportTelemetry()`** – Added no-op stub; can be wired to Posthog or runs API later.

---

## Quick Reference: Full GenericThreadHistoryAdapter Shape

```ts
{
  async load(): Promise<MessageFormatRepository<TMessage>>,
  async append(item: MessageFormatItem<TMessage>): Promise<void>,
  update?(item, localMessageId): Promise<void>,        // Implemented
  reportTelemetry?(items, options): void,               // No-op, extensible
}
```
