# MessagePrimitive

Individual message display.

## Parts

| Part | Description |
|------|-------------|
| `.Root` | Message container |
| `.Content` | Message body with parts |
| `.Avatar` | User/assistant avatar |
| `.Status` | Loading/error status |
| `.BranchPicker` | Navigate branches |
| `.If` | Conditional rendering |

## Basic Structure

```tsx
<MessagePrimitive.Root>
  <MessagePrimitive.Avatar fallback="U" />
  <MessagePrimitive.Content />
</MessagePrimitive.Root>
```

## MessagePrimitive.Root

Container for a single message.

```tsx
<MessagePrimitive.Root
  className="flex gap-2 mb-4"
  data-role="user"  // or "assistant"
>
  {children}
</MessagePrimitive.Root>
```

## MessagePrimitive.Content

Renders message content parts (text, images, tool calls, etc.).

```tsx
// Simple usage - uses default rendering
<MessagePrimitive.Content />

// Custom part rendering
<MessagePrimitive.Content
  components={{
    Text: ({ part }) => (
      <p className="whitespace-pre-wrap">{part.text}</p>
    ),
    Image: ({ part }) => (
      <img src={part.image} alt="" className="max-w-full rounded" />
    ),
    ToolCall: ({ part }) => (
      <div className="bg-gray-100 rounded p-2">
        <strong>{part.toolName}</strong>
        {part.result && <pre>{JSON.stringify(part.result, null, 2)}</pre>}
      </div>
    ),
    Reasoning: ({ part }) => (
      <details className="text-gray-500">
        <summary>Thinking...</summary>
        <p>{part.text}</p>
      </details>
    ),
    Source: ({ part }) => (
      <a href={part.url} className="text-blue-500">
        {part.title}
      </a>
    ),
    File: ({ part }) => (
      <a
        href={`data:${part.mimeType};base64,${part.data}`}
        download={part.filename ?? "file"}
      >
        📄 {part.filename ?? "file"}
      </a>
    ),
  }}
/>
```

### Part Types

| Type | Description | Properties |
|------|-------------|------------|
| `Text` | Plain text | `text` |
| `Image` | Image attachment | `image` (URL) |
| `ToolCall` | Tool invocation | `toolName`, `args`, `argsText`, `result?`, `isError?`, `artifact?` |
| `Reasoning` | Chain-of-thought | `text` |
| `Source` | Citation/reference | `url`, `title` |
| `File` | File attachment | `filename?`, `data`, `mimeType` |

## MessagePrimitive.Avatar

User or assistant avatar.

```tsx
<MessagePrimitive.Avatar
  src="/user-avatar.png"    // Image URL
  fallback="U"              // Fallback text
  className="w-8 h-8 rounded-full"
/>
```

## MessagePrimitive.Status

Shows message status (loading, error).

```tsx
<MessagePrimitive.Status>
  {/* Custom loading indicator */}
  <div className="animate-pulse">●●●</div>
</MessagePrimitive.Status>
```

## MessagePrimitive.If

Conditional rendering based on message state.

```tsx
// By role
<MessagePrimitive.If user>User message content</MessagePrimitive.If>
<MessagePrimitive.If assistant>Assistant message content</MessagePrimitive.If>
<MessagePrimitive.If system>System message content</MessagePrimitive.If>

// By status
<MessagePrimitive.If running>Generating...</MessagePrimitive.If>
<MessagePrimitive.If complete>Done</MessagePrimitive.If>

// By features
<MessagePrimitive.If hasBranches>
  <BranchPickerPrimitive.Root>...</BranchPickerPrimitive.Root>
</MessagePrimitive.If>

<MessagePrimitive.If canCopy>
  <ActionBarPrimitive.Copy />
</MessagePrimitive.If>
```

### Available Conditions

- `user` / `assistant` / `system` - Message role
- `running` / `complete` / `incomplete` - Generation status
- `hasBranches` - Has edit history
- `canCopy` / `canReload` / `canEdit` / `canSpeak` - Capabilities

## Complete Example

```tsx
function CustomUserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end mb-4">
      <div className="max-w-[80%]">
        <div className="bg-blue-500 text-white rounded-2xl rounded-tr-sm px-4 py-2">
          <MessagePrimitive.Content />
        </div>

        {/* Branch picker for edits */}
        <MessagePrimitive.If hasBranches>
          <div className="flex justify-end mt-1">
            <BranchPickerPrimitive.Root className="flex items-center gap-1 text-xs text-gray-500">
              <BranchPickerPrimitive.Previous className="hover:text-gray-700">
                ←
              </BranchPickerPrimitive.Previous>
              <span>
                <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
              </span>
              <BranchPickerPrimitive.Next className="hover:text-gray-700">
                →
              </BranchPickerPrimitive.Next>
            </BranchPickerPrimitive.Root>
          </div>
        </MessagePrimitive.If>
      </div>

      <MessagePrimitive.Avatar
        fallback="U"
        className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center ml-2"
      />
    </MessagePrimitive.Root>
  );
}

function CustomAssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex mb-4">
      <MessagePrimitive.Avatar
        src="/ai-avatar.png"
        fallback="AI"
        className="w-8 h-8 rounded-full mr-2 shrink-0"
      />

      <div className="max-w-[80%]">
        <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2">
          <MessagePrimitive.Content
            components={{
              Text: ({ part }) => (
                <p className="whitespace-pre-wrap">{part.text}</p>
              ),
              ToolCall: ToolCallUI,
            }}
          />

          {/* Loading indicator while generating */}
          <MessagePrimitive.If running>
            <div className="flex gap-1 mt-2">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
            </div>
          </MessagePrimitive.If>
        </div>

        {/* Action bar */}
        <MessagePrimitive.If complete>
          <ActionBarPrimitive.Root className="flex gap-2 mt-1 opacity-0 hover:opacity-100 transition-opacity">
            <ActionBarPrimitive.Copy className="text-xs text-gray-500 hover:text-gray-700">
              Copy
            </ActionBarPrimitive.Copy>
            <ActionBarPrimitive.Reload className="text-xs text-gray-500 hover:text-gray-700">
              Regenerate
            </ActionBarPrimitive.Reload>
            <ActionBarPrimitive.Speak className="text-xs text-gray-500 hover:text-gray-700">
              🔊
            </ActionBarPrimitive.Speak>
          </ActionBarPrimitive.Root>
        </MessagePrimitive.If>
      </div>
    </MessagePrimitive.Root>
  );
}
```

## Accessing Message State

```tsx
import { useMessage, useMessageRuntime } from "@assistant-ui/react";

function MessageInfo() {
  // Reactive state
  const { role, content, status, createdAt } = useMessage();

  // Runtime API
  const runtime = useMessageRuntime();
  const handleEdit = () => runtime.edit({
    role: "user",
    content: [{ type: "text", text: "New content" }],
  });

  return (
    <div>
      <p>Role: {role}</p>
      <p>Status: {status}</p>
    </div>
  );
}
```
