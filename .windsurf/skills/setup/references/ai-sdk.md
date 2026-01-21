# AI SDK v6 Setup

Complete guide for integrating assistant-ui with Vercel AI SDK v6.

## What Changed in v6

AI SDK v6 introduced breaking changes:

| v5 | v6 |
|----|-----|
| `import { useChat } from "ai/react"` | `import { useChat } from "@ai-sdk/react"` |
| `useAISDKRuntime(chat)` | `useChatRuntime({ transport })` |
| Manual thread management | Built-in thread list |

## Installation

```bash
npm install @assistant-ui/react @assistant-ui/react-ai-sdk @ai-sdk/react ai
npm install @ai-sdk/openai  # Provider of choice
```

## Basic Setup

### Frontend Component

```tsx
// app/page.tsx
"use client";

import { AssistantRuntimeProvider, Thread } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";

export default function ChatPage() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

### API Route

```ts
// app/api/chat/route.ts
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    system: "You are a helpful assistant.",
    messages,
  });

  return result.toUIMessageStreamResponse();
}
```

## useChatRuntime Options

```tsx
const runtime = useChatRuntime({
  // Transport configuration
  transport: new AssistantChatTransport({
    api: "/api/chat",
    headers: {
      "X-Custom-Header": "value",
    },
  }),

  // Initial state
  initialMessages: [
    { role: "assistant", content: "Hello! How can I help?" },
  ],

  // Callbacks
  onError: (error) => {
    console.error("Chat error:", error);
    toast.error("Failed to send message");
  },

  // Cloud persistence (optional)
  cloud: assistantCloud,

  // Custom adapters (advanced)
  adapters: {
    attachments: myAttachmentAdapter,
    feedback: myFeedbackAdapter,
  },
});
```

## With Tools

### Backend

```ts
// app/api/chat/route.ts
import { openai } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";

const tools = {
  get_weather: tool({
    description: "Get weather for a city",
    inputSchema: z.object({
      city: z.string().describe("City name"),
      unit: z.enum(["celsius", "fahrenheit"]).optional(),
    }),
    execute: async ({ city, unit = "celsius" }) => {
      // Call weather API
      return { temperature: 22, city, unit };
    },
  }),
};

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    messages,
    tools,
    stopWhen: stepCountIs(5),  // Allow multi-step tool use
  });

  return result.toUIMessageStreamResponse();
}
```

### Frontend Tool UI

```tsx
import { makeAssistantToolUI } from "@assistant-ui/react";

const WeatherToolUI = makeAssistantToolUI({
  toolName: "get_weather",
  render: ({ args, result, status }) => {
    if (status === "running") {
      return <div>Loading weather for {args.city}...</div>;
    }
    return (
      <div className="p-4 rounded bg-blue-50">
        <strong>{result?.city}</strong>: {result?.temperature}°{result?.unit}
      </div>
    );
  },
});

// Register in app
function App() {
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <WeatherToolUI />
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

## With Different Providers

### Anthropic (Claude)

```ts
import { anthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";

const result = streamText({
  model: anthropic("claude-sonnet-4-20250514"),
  messages,
});
```

### Google (Gemini)

```ts
import { google } from "@ai-sdk/google";
import { streamText } from "ai";

const result = streamText({
  model: google("gemini-2.0-flash"),
  messages,
});
```

### AWS Bedrock

```ts
import { bedrock } from "@ai-sdk/amazon-bedrock";
import { streamText } from "ai";

const result = streamText({
  model: bedrock("anthropic.claude-3-sonnet-20240229-v1:0"),
  messages,
});
```

### Azure OpenAI

```ts
import { azure } from "@ai-sdk/azure";
import { streamText } from "ai";

const result = streamText({
  model: azure("gpt-4o"),  // Your deployment name
  messages,
});
```

## Advanced Configuration

```ts
streamText({
  model: openai("gpt-4o"),
  messages,
  system: "You are a helpful assistant.",
  temperature: 0.7,
  maxTokens: 1000,
  stopSequences: ["END", "STOP"],
});
```

## Structured Output

```ts
import { z } from "zod";
import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";

const { output } = await generateText({
  model: openai("gpt-4o"),
  output: Output.object({
    schema: z.object({
      name: z.string(),
      age: z.number(),
      hobbies: z.array(z.string()),
    }),
  }),
  prompt: "Generate a user profile",
});
```

AI SDK v6 uses `generateText` + `Output.object` for structured output; `generateObject` is the older pattern.

## Error Handling

```tsx
const runtime = useChatRuntime({
  transport: new AssistantChatTransport({ api: "/api/chat" }),
  onError: (error) => {
    if (error.message.includes("rate limit")) {
      toast.error("Too many requests. Please wait.");
    } else if (error.message.includes("context length")) {
      toast.error("Conversation too long. Try starting a new chat.");
    } else {
      toast.error("Something went wrong. Please try again.");
    }
  },
});
```

## With Authentication

```tsx
import { useSession } from "next-auth/react";

function Chat() {
  const { data: session } = useSession();

  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      headers: {
        Authorization: `Bearer ${session?.accessToken}`,
      },
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

## Dynamic Model Selection

```tsx
function Chat({ model }: { model: string }) {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
      body: { model },  // Pass model to API
    }),
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />
    </AssistantRuntimeProvider>
  );
}

// Backend handles model selection
export async function POST(req: Request) {
  const { messages, model } = await req.json();

  const provider = model.startsWith("claude")
    ? anthropic(model)
    : openai(model);

  const result = streamText({ model: provider, messages });
  return result.toUIMessageStreamResponse();
}
```

## With Cloud Persistence

```tsx
import { AssistantCloud, AssistantRuntimeProvider, Thread, ThreadList } from "@assistant-ui/react";
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";

const cloud = new AssistantCloud({
  baseUrl: process.env.NEXT_PUBLIC_ASSISTANT_BASE_URL,
  authToken: async () => getAuthToken(),
});

function ChatPage() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({
      api: "/api/chat",
    }),
    cloud,  // Enables thread persistence
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadList />  {/* Shows saved threads */}
      <Thread />
    </AssistantRuntimeProvider>
  );
}
```

## Migration from v5

### Before (v5)

```tsx
import { useChat } from "ai/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";

function Chat() {
  const chat = useChat({ api: "/api/chat" });
  const runtime = useAISDKRuntime(chat);
  // ...
}
```

### After (v6)

```tsx
import { useChatRuntime, AssistantChatTransport } from "@assistant-ui/react-ai-sdk";

function Chat() {
  const runtime = useChatRuntime({
    transport: new AssistantChatTransport({ api: "/api/chat" }),
  });
  // ...
}
```

## Troubleshooting

**"Module not found: @ai-sdk/react"**
```bash
npm install @ai-sdk/react
```

**"useChat is not a function"**
Mixing v5 and v6. Remove old imports:
```bash
npm uninstall ai/react  # if present
npm install @ai-sdk/react@latest ai@latest
```

**Streaming stops mid-response**
Check `stopWhen` when using tools - use `stepCountIs(n)` to allow multi-step.

**Tool results not showing**
Ensure you return from tool.execute(), not just mutate state.
