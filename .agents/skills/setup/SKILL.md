---
name: setup
description: Setup and configure assistant-ui in a project. Use when installing packages, configuring runtimes, or troubleshooting setup issues.
version: 0.0.1
license: MIT
---

# assistant-ui Setup

**Always consult [assistant-ui.com/llms.txt](https://assistant-ui.com/llms.txt) for latest API.**

## References

- [./references/ai-sdk.md](./references/ai-sdk.md) -- AI SDK v6 setup (recommended)
- [./references/langgraph.md](./references/langgraph.md) -- LangGraph agent setup
- [./references/custom-backend.md](./references/custom-backend.md) -- useLocalRuntime / useExternalStoreRuntime
- [./references/ag-ui.md](./references/ag-ui.md) -- AG-UI protocol
- [./references/a2a.md](./references/a2a.md) -- A2A protocol
- [./references/styling.md](./references/styling.md) -- Styling options
- [./references/tanstack.md](./references/tanstack.md) -- TanStack Router

## Pick Your Setup

```
Using Vercel AI SDK?
├─ Yes → useChatRuntime (recommended)
└─ No
   ├─ LangGraph agents? → useLangGraphRuntime
   ├─ AG-UI protocol? → useAgUiRuntime
   ├─ A2A protocol? → useA2ARuntime
   ├─ External state (Redux/Zustand)? → useExternalStoreRuntime
   └─ Custom API → useLocalRuntime
```

## Quick Start (AI SDK)

```bash
npm install @assistant-ui/react @assistant-ui/react-ai-sdk @ai-sdk/react ai @ai-sdk/openai
```

```tsx
// app/page.tsx
"use client";
import { AssistantRuntimeProvider, Thread } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";

export default function Chat() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

```ts
// app/api/chat/route.ts
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({ model: openai("gpt-4o"), messages });
  return result.toUIMessageStreamResponse();
}
```

## Styling

```tsx
// Option 1: Pre-built CSS
import "@assistant-ui/styles/default.css";

// Option 2: Tailwind (add to tailwind.config.js)
content: ["./node_modules/@assistant-ui/react/dist/**/*.js"]
```

## Environment Variables

```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
NEXT_PUBLIC_ASSISTANT_BASE_URL=https://api.assistant-ui.com  # For cloud
```

## Common Gotchas

**"Cannot find module @ai-sdk/react"**
```bash
npm install @ai-sdk/react
```

**Styles not applied**
- Import CSS at root level or configure Tailwind content paths

**Streaming not working**
- Use `toUIMessageStreamResponse()` in API route
- Check for CORS errors in console

**"runtime is undefined"**
- Call `useChatRuntime` inside a component, not at module level
