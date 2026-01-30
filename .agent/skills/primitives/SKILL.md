---
name: primitives
description: Guide for assistant-ui UI primitives - ThreadPrimitive, ComposerPrimitive, MessagePrimitive. Use when customizing chat UI components.
version: 0.0.1
license: MIT
---

# assistant-ui Primitives

**Always consult [assistant-ui.com/llms.txt](https://assistant-ui.com/llms.txt) for latest API.**

Composable, unstyled components following Radix UI patterns.

## References

- [./references/thread.md](./references/thread.md) -- ThreadPrimitive deep dive
- [./references/composer.md](./references/composer.md) -- ComposerPrimitive deep dive
- [./references/message.md](./references/message.md) -- MessagePrimitive deep dive
- [./references/action-bar.md](./references/action-bar.md) -- ActionBarPrimitive deep dive

## Import

```tsx
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  ActionBarPrimitive,
  BranchPickerPrimitive,
  AttachmentPrimitive,
  ThreadListPrimitive,
  ThreadListItemPrimitive,
} from "@assistant-ui/react";
```

## Primitive Parts

| Primitive | Key Parts |
|-----------|-----------|
| `ThreadPrimitive` | `.Root`, `.Viewport`, `.Messages`, `.Empty`, `.ScrollToBottom` |
| `ComposerPrimitive` | `.Root`, `.Input`, `.Send`, `.Cancel`, `.Attachments` |
| `MessagePrimitive` | `.Root`, `.Content`, `.Avatar`, `.If` |
| `ActionBarPrimitive` | `.Copy`, `.Edit`, `.Reload`, `.Speak` |
| `BranchPickerPrimitive` | `.Previous`, `.Next`, `.Number`, `.Count` |

## Custom Thread Example

```tsx
function CustomThread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full">
      <ThreadPrimitive.Empty>
        <div className="flex-1 flex items-center justify-center">
          Start a conversation
        </div>
      </ThreadPrimitive.Empty>

      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-4">
        <ThreadPrimitive.Messages components={{
          UserMessage: CustomUserMessage,
          AssistantMessage: CustomAssistantMessage,
        }} />
      </ThreadPrimitive.Viewport>

      <ComposerPrimitive.Root className="border-t p-4 flex gap-2">
        <ComposerPrimitive.Input className="flex-1 rounded-lg border px-4 py-2" />
        <ComposerPrimitive.Send className="bg-blue-500 text-white px-4 py-2 rounded-lg">
          Send
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}
```

## Conditional Rendering

```tsx
<MessagePrimitive.If user>User only</MessagePrimitive.If>
<MessagePrimitive.If assistant>Assistant only</MessagePrimitive.If>
<MessagePrimitive.If running>Generating...</MessagePrimitive.If>
<MessagePrimitive.If hasBranches>Has edit history</MessagePrimitive.If>

<ComposerPrimitive.If submitting>
  <ComposerPrimitive.Cancel>Stop</ComposerPrimitive.Cancel>
</ComposerPrimitive.If>

<ThreadPrimitive.If empty>No messages</ThreadPrimitive.If>
```

## Content Parts

```tsx
<MessagePrimitive.Content components={{
  Text: ({ part }) => <p>{part.text}</p>,
  Image: ({ part }) => <img src={part.image} alt="" />,
  ToolCall: ({ part }) => <div>Tool: {part.toolName}</div>,
  Reasoning: ({ part }) => <details><summary>Thinking</summary>{part.text}</details>,
}} />
```

## Branch Picker

```tsx
<MessagePrimitive.If hasBranches>
  <BranchPickerPrimitive.Root className="flex items-center gap-1">
    <BranchPickerPrimitive.Previous>←</BranchPickerPrimitive.Previous>
    <span><BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count /></span>
    <BranchPickerPrimitive.Next>→</BranchPickerPrimitive.Next>
  </BranchPickerPrimitive.Root>
</MessagePrimitive.If>
```

## Common Gotchas

**Primitives not rendering**
- Wrap in `AssistantRuntimeProvider`
- Ensure parent primitive provides context

**Styles not applying**
- Primitives are unstyled by default
- Add className or use `@assistant-ui/styles`
