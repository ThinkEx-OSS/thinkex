# ActionBarPrimitive

Message action buttons (copy, edit, reload, etc.).

## Parts

| Part | Description |
|------|-------------|
| `.Root` | Container |
| `.Copy` | Copy message to clipboard |
| `.Edit` | Enter edit mode |
| `.Reload` | Regenerate response |
| `.Speak` | Text-to-speech |
| `.StopSpeaking` | Stop TTS |
| `.Feedback` | Thumbs up/down |
| `.Export` | Export message |
| `.If` | Conditional rendering |

## Basic Usage

```tsx
<ActionBarPrimitive.Root>
  <ActionBarPrimitive.Copy />
  <ActionBarPrimitive.Reload />
  <ActionBarPrimitive.Edit />
</ActionBarPrimitive.Root>
```

## ActionBarPrimitive.Root

Container for action buttons. Usually placed inside a message.

```tsx
<ActionBarPrimitive.Root
  className="flex gap-2 mt-2"
  hideWhenRunning  // Hide while generating
  autohide         // Show on hover only
  autohideFloat="single-branch"  // Float behavior
>
  {children}
</ActionBarPrimitive.Root>
```

### Props

- `hideWhenRunning` - Hide while assistant is generating
- `autohide` - Only show on message hover
- `autohideFloat` - Float positioning mode

## ActionBarPrimitive.Copy

Copy message content to clipboard.

```tsx
<ActionBarPrimitive.Copy
  className="p-1 rounded hover:bg-gray-100"
  copiedDuration={2000}  // Duration of "copied" state
>
  {/* Default content */}
  <CopyIcon className="w-4 h-4" />
</ActionBarPrimitive.Copy>

// With copied state
<ActionBarPrimitive.Copy>
  <ActionBarPrimitive.If copied>
    <CheckIcon className="w-4 h-4 text-green-500" />
  </ActionBarPrimitive.If>
  <ActionBarPrimitive.If notCopied>
    <CopyIcon className="w-4 h-4" />
  </ActionBarPrimitive.If>
</ActionBarPrimitive.Copy>
```

## ActionBarPrimitive.Reload

Regenerate the assistant's response.

```tsx
<ActionBarPrimitive.Reload className="p-1 rounded hover:bg-gray-100">
  <RefreshIcon className="w-4 h-4" />
  Regenerate
</ActionBarPrimitive.Reload>
```

## ActionBarPrimitive.Edit

Enter edit mode for user messages.

```tsx
<MessagePrimitive.If user>
  <ActionBarPrimitive.Edit className="p-1 rounded hover:bg-gray-100">
    <EditIcon className="w-4 h-4" />
    Edit
  </ActionBarPrimitive.Edit>
</MessagePrimitive.If>
```

## ActionBarPrimitive.Speak / StopSpeaking

Text-to-speech controls.

```tsx
<ActionBarPrimitive.If notSpeaking>
  <ActionBarPrimitive.Speak className="p-1 rounded hover:bg-gray-100">
    🔊 Read aloud
  </ActionBarPrimitive.Speak>
</ActionBarPrimitive.If>

<ActionBarPrimitive.If speaking>
  <ActionBarPrimitive.StopSpeaking className="p-1 rounded bg-red-100">
    ⏹️ Stop
  </ActionBarPrimitive.StopSpeaking>
</ActionBarPrimitive.If>
```

## ActionBarPrimitive.Feedback

Thumbs up/down feedback buttons.

```tsx
<ActionBarPrimitive.Feedback
  className="p-1 rounded hover:bg-gray-100"
  type="positive"  // or "negative"
>
  👍
</ActionBarPrimitive.Feedback>

<ActionBarPrimitive.Feedback type="negative">
  👎
</ActionBarPrimitive.Feedback>
```

Requires a feedback adapter in the runtime:

```tsx
const runtime = useChatRuntime({
  transport: new AssistantChatTransport({
    api: "/api/chat",
  }),
  adapters: {
    feedback: {
      submit: async ({ messageId, type }) => {
        await fetch("/api/feedback", {
          method: "POST",
          body: JSON.stringify({ messageId, type }),
        });
      },
    },
  },
});
```

## ActionBarPrimitive.If

Conditional rendering based on action bar state.

```tsx
// Copy state
<ActionBarPrimitive.If copied>Copied!</ActionBarPrimitive.If>
<ActionBarPrimitive.If notCopied>Copy</ActionBarPrimitive.If>

// Speech state
<ActionBarPrimitive.If speaking>Playing...</ActionBarPrimitive.If>
<ActionBarPrimitive.If notSpeaking>Read aloud</ActionBarPrimitive.If>
```

### Available Conditions

- `copied` / `notCopied` - Copy button state
- `speaking` / `notSpeaking` - TTS state

## Complete Example

```tsx
function MessageActionBar() {
  return (
    <ActionBarPrimitive.Root
      className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
      hideWhenRunning
    >
      {/* Copy */}
      <ActionBarPrimitive.Copy
        className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        copiedDuration={2000}
      >
        <ActionBarPrimitive.If copied>
          <CheckIcon className="w-4 h-4 text-green-500" />
        </ActionBarPrimitive.If>
        <ActionBarPrimitive.If notCopied>
          <CopyIcon className="w-4 h-4" />
        </ActionBarPrimitive.If>
      </ActionBarPrimitive.Copy>

      {/* Regenerate (assistant only) */}
      <MessagePrimitive.If assistant>
        <ActionBarPrimitive.Reload className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100">
          <RefreshIcon className="w-4 h-4" />
        </ActionBarPrimitive.Reload>
      </MessagePrimitive.If>

      {/* Edit (user only) */}
      <MessagePrimitive.If user>
        <ActionBarPrimitive.Edit className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100">
          <EditIcon className="w-4 h-4" />
        </ActionBarPrimitive.Edit>
      </MessagePrimitive.If>

      {/* Text-to-speech */}
      <ActionBarPrimitive.If notSpeaking>
        <ActionBarPrimitive.Speak className="p-1.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100">
          <SpeakerIcon className="w-4 h-4" />
        </ActionBarPrimitive.Speak>
      </ActionBarPrimitive.If>
      <ActionBarPrimitive.If speaking>
        <ActionBarPrimitive.StopSpeaking className="p-1.5 rounded text-red-500 bg-red-50">
          <StopIcon className="w-4 h-4" />
        </ActionBarPrimitive.StopSpeaking>
      </ActionBarPrimitive.If>

      {/* Feedback */}
      <div className="border-l pl-1 ml-1">
        <ActionBarPrimitive.Feedback
          type="positive"
          className="p-1.5 rounded text-gray-500 hover:text-green-600 hover:bg-green-50"
        >
          <ThumbsUpIcon className="w-4 h-4" />
        </ActionBarPrimitive.Feedback>
        <ActionBarPrimitive.Feedback
          type="negative"
          className="p-1.5 rounded text-gray-500 hover:text-red-600 hover:bg-red-50"
        >
          <ThumbsDownIcon className="w-4 h-4" />
        </ActionBarPrimitive.Feedback>
      </div>
    </ActionBarPrimitive.Root>
  );
}
```

## Using with Messages

```tsx
function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="group flex mb-4">
      <MessagePrimitive.Avatar fallback="AI" />
      <div className="flex-1">
        <MessagePrimitive.Content />
        <MessageActionBar />
      </div>
    </MessagePrimitive.Root>
  );
}
```

Note the `group` class on `.Root` to enable hover state propagation.
