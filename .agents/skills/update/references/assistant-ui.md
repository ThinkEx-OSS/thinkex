# assistant-ui Version Migrations

Migrations for upgrading between assistant-ui versions.

## Version Detection

```bash
npm ls @assistant-ui/react
npm view @assistant-ui/react version  # Latest
```

## Migration: → 0.11.x (Runtime Rearchitecture)

### From 0.10.x

**New unified state API:**

```typescript
import {
  useAssistantApi,
  useAssistantState,
  useAssistantEvent
} from "@assistant-ui/react";

// State access (replaces various useThread* hooks)
const messages = useAssistantState(s => s.thread.messages);
const isRunning = useAssistantState(s => s.thread.isRunning);

// Actions
const api = useAssistantApi();
api.thread().append({ role: "user", content: [{ type: "text", text: "Hello" }] });
api.thread().cancelRun();

// Events
useAssistantEvent("message-added", (e) => {
  console.log("New message:", e.message);
});
```

**AI SDK v5/v6 support added:**
- Use `useChatRuntime` for AI SDK v6
- `useAISDKRuntime` still works for migration

**Renames:**
- `toolUIs` → `tools` (0.11.39)
- `useLocalThreadRuntime` deprecated, use `useLocalRuntime`

---

## Migration: → 0.10.x (ESM Only)

### From 0.9.x

**BREAKING: CommonJS dropped**

Update bundler if needed:
```json
// package.json
{
  "type": "module"
}
```

Or configure bundler for ESM:
```javascript
// next.config.js
export default {
  experimental: {
    esmExternals: true
  }
}
```

**New APIs:**
- `ContentPart` renamed to `MessagePart` (0.10.25)
- `MessageContent.ToolGroup` added
- `runtime.thread.reset()` added

---

## Migration: → 0.9.x (Edge Split)

### From 0.8.x

**Edge package split:**
- Edge runtime utilities moved to separate entry points
- Check imports if using edge runtime

---

## Migration: → 0.8.x (UI Split)

### From 0.7.x

**BREAKING: Pre-styled UI moved out of `@assistant-ui/react`**

0.7.x: `Thread` etc. were re-exported from `@assistant-ui/react` via `./ui` subpath
0.8.0+: Use shadcn/ui registry (recommended) or `@assistant-ui/react-ui` (legacy, not maintained)

**Option 1: shadcn/ui Registry (Recommended)**

```bash
# Using assistant-ui CLI
npx assistant-ui add thread thread-list

# Or using shadcn CLI
npx shadcn@latest add "https://r.assistant-ui.com/thread"
```

Components are copied to your project (e.g., `components/assistant-ui/thread.tsx`).

```diff
// Styled components - now local files
// Note: ThreadWelcome is now embedded inside Thread (shows when thread is empty)
- import { Thread, ThreadWelcome } from "@assistant-ui/react";
+ import { Thread } from "@/components/assistant-ui/thread";

// Primitives remain in @assistant-ui/react (no change)
import { ThreadPrimitive } from "@assistant-ui/react";
```

**Option 2: Legacy Package (Not Recommended)**

`@assistant-ui/react-ui` exists but is not actively maintained.

**Search for imports to update:**
```bash
grep -r "from ['\"]@assistant-ui/react['\"]" --include="*.tsx" --include="*.ts" | grep -v "Primitive"
```

**setResult/setArtifact merged (0.8.18):**
```diff
- tool.setResult(result);
- tool.setArtifact(artifact);
+ tool.setResponse({ result, artifact });
```

---

## Migration: → 0.7.x (Thread API)

### From 0.6.x or 0.5.x

**BREAKING (0.7.44): Thread API moved**

```diff
- runtime.switchToThread(threadId);
+ runtime.threads.switchToThread(threadId);

- runtime.switchToNewThread();
+ runtime.threads.switchToNewThread();

- runtime.threadList
+ runtime.threads
```

**Search:**
```bash
grep -r "runtime\.switchToThread\|runtime\.switchToNewThread\|runtime\.threadList" --include="*.tsx" --include="*.ts"
```

**Deprecated features dropped (0.7.0):**
- All previously deprecated APIs removed
- `ThreadListItemPrimitive` introduced

---

## Migration: → 0.5.x (Runtime API)

### From 0.4.x

**maxToolRoundtrips → maxSteps (0.5.74):**
```diff
- maxToolRoundtrips: 5,
+ maxSteps: 5,
```

**New Runtime API introduced (0.5.61+):**
- `ThreadRuntime.Composer`
- Status/attachments/metadata on all messages

---

## Migration: → 0.4.x (Message Types)

### From 0.3.x

**BREAKING: Message type renames**

```diff
- import type { AssistantMessage, UserMessage } from "@assistant-ui/react";
+ import type { ThreadAssistantMessage, ThreadUserMessage } from "@assistant-ui/react";
```

**Search:**
```bash
grep -r "AssistantMessage\|UserMessage" --include="*.tsx" --include="*.ts" | grep -v "Thread"
```

**System message support added**

---

## Migration: → 0.3.x

### From 0.2.x

**BREAKING: Message.InProgress dropped**
- Use message status instead of `Message.InProgress`

---

## Migration: → 0.2.x

### From 0.1.x

**BREAKING: MessagePartText renders as `<p>`**
- Text parts now wrapped in paragraph element
- Adjust CSS if needed

---

## Automated Search Commands

Find patterns that need updating:

```bash
# Old thread API
grep -rn "runtime\.switchToThread\|runtime\.threadList" --include="*.tsx" --include="*.ts"

# Old message types
grep -rn "AssistantMessage\[^C\]\|UserMessage\[^C\]" --include="*.tsx" --include="*.ts"

# Old tool API
grep -rn "setResult\|setArtifact" --include="*.tsx" --include="*.ts"

# Styled imports (need shadcn registry migration)
grep -rn "from ['\"]@assistant-ui/react['\"]" --include="*.tsx" | grep -v "Primitive\|Runtime\|use"
```

## Verification

After migration:

```bash
# Type check
npx tsc --noEmit

# Build
pnpm build

# Test
pnpm test
```

Manual verification:
- [ ] App starts
- [ ] Chat renders
- [ ] Messages send/receive
- [ ] Tools work
- [ ] Thread switching works
