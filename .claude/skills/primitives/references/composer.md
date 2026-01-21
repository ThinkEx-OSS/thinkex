# ComposerPrimitive

Message input form for sending messages.

## Parts

| Part | Description |
|------|-------------|
| `.Root` | Form container |
| `.Input` | Text input/textarea |
| `.Send` | Submit button |
| `.Cancel` | Cancel generation |
| `.AddAttachment` | Attach files button |
| `.Attachments` | Render attachments |
| `.AttachmentDropzone` | Drag-drop area |
| `.Dictate` | Start voice input |
| `.StopDictation` | Stop voice input |
| `.If` | Conditional rendering |

## Basic Structure

```tsx
<ComposerPrimitive.Root>
  <ComposerPrimitive.Input placeholder="Type a message..." />
  <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
</ComposerPrimitive.Root>
```

## ComposerPrimitive.Root

Form element that handles submission.

```tsx
<ComposerPrimitive.Root
  className="flex gap-2 p-4 border-t"
  onSubmit={() => console.log("Submitted")}
>
  {children}
</ComposerPrimitive.Root>
```

## ComposerPrimitive.Input

Auto-resizing textarea for message input.

```tsx
<ComposerPrimitive.Input
  className="flex-1 resize-none rounded-lg border px-4 py-2"
  placeholder="Type a message..."
  rows={1}
  autoFocus
/>
```

### Props

- `placeholder` - Placeholder text
- `rows` - Initial row count (auto-resizes)
- `autoFocus` - Focus on mount
- `disabled` - Disable input
- Standard textarea props

## ComposerPrimitive.Send

Submit button. Disabled when input is empty or generating.

```tsx
<ComposerPrimitive.Send
  className="bg-blue-500 text-white px-4 py-2 rounded-lg disabled:opacity-50"
>
  Send
</ComposerPrimitive.Send>
```

## ComposerPrimitive.Cancel

Cancel ongoing generation.

```tsx
<ComposerPrimitive.If submitting>
  <ComposerPrimitive.Cancel className="bg-red-500 text-white px-4 py-2 rounded-lg">
    Stop
  </ComposerPrimitive.Cancel>
</ComposerPrimitive.If>
```

## ComposerPrimitive.If

Conditional rendering based on composer state.

```tsx
// While generating
<ComposerPrimitive.If submitting>
  <ComposerPrimitive.Cancel>Stop</ComposerPrimitive.Cancel>
</ComposerPrimitive.If>

// When not generating
<ComposerPrimitive.If notSubmitting>
  <ComposerPrimitive.Send>Send</ComposerPrimitive.Send>
</ComposerPrimitive.If>

// Has file attachments
<ComposerPrimitive.If hasAttachments>
  <AttachmentList />
</ComposerPrimitive.If>
```

### Available Conditions

- `submitting` / `notSubmitting` - Message being sent
- `hasAttachments` / `notHasAttachments` - Files attached
- `canSend` / `cannotSend` - Can submit form
- `focused` / `notFocused` - Input is focused

## Attachments

### Add Attachment Button

```tsx
<ComposerPrimitive.AddAttachment
  className="p-2 rounded hover:bg-gray-100"
  accept="image/*,.pdf"  // Accepted file types
>
  📎 Attach
</ComposerPrimitive.AddAttachment>
```

### Attachment List

```tsx
<ComposerPrimitive.Attachments className="flex gap-2 mb-2">
  <AttachmentPrimitive.Root className="flex items-center gap-1 bg-gray-100 rounded px-2 py-1">
    <AttachmentPrimitive.Name className="text-sm" />
    <AttachmentPrimitive.Remove className="text-red-500">×</AttachmentPrimitive.Remove>
  </AttachmentPrimitive.Root>
</ComposerPrimitive.Attachments>
```

### Drag-Drop Zone

```tsx
<ComposerPrimitive.AttachmentDropzone
  className="border-2 border-dashed rounded-lg p-4 text-center"
>
  Drop files here
</ComposerPrimitive.AttachmentDropzone>
```

## Voice Input

```tsx
<ComposerPrimitive.If notDictating>
  <ComposerPrimitive.Dictate className="p-2 rounded hover:bg-gray-100">
    🎤 Voice
  </ComposerPrimitive.Dictate>
</ComposerPrimitive.If>

<ComposerPrimitive.If dictating>
  <ComposerPrimitive.StopDictation className="p-2 rounded bg-red-100">
    ⏹️ Stop
  </ComposerPrimitive.StopDictation>
</ComposerPrimitive.If>
```

## Complete Example

```tsx
function CustomComposer() {
  return (
    <ComposerPrimitive.Root className="border-t p-4">
      {/* Drag-drop overlay */}
      <ComposerPrimitive.AttachmentDropzone className="absolute inset-0 flex items-center justify-center bg-blue-50/80 border-2 border-dashed border-blue-300 rounded-lg opacity-0 pointer-events-none data-[dragging]:opacity-100 data-[dragging]:pointer-events-auto">
        <p className="text-blue-500">Drop files to attach</p>
      </ComposerPrimitive.AttachmentDropzone>

      {/* Attached files */}
      <ComposerPrimitive.If hasAttachments>
        <ComposerPrimitive.Attachments className="flex flex-wrap gap-2 mb-2">
          <AttachmentPrimitive.Root className="group flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5">
            <AttachmentPrimitive.Name className="text-sm truncate max-w-[150px]" />
            <AttachmentPrimitive.Remove className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100">
              ×
            </AttachmentPrimitive.Remove>
          </AttachmentPrimitive.Root>
        </ComposerPrimitive.Attachments>
      </ComposerPrimitive.If>

      {/* Input row */}
      <div className="flex items-end gap-2">
        <ComposerPrimitive.AddAttachment className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded">
          <PaperclipIcon className="w-5 h-5" />
        </ComposerPrimitive.AddAttachment>

        <ComposerPrimitive.Input
          className="flex-1 max-h-40 resize-none rounded-lg border border-gray-200 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Type a message..."
          rows={1}
        />

        <ComposerPrimitive.If notDictating>
          <ComposerPrimitive.Dictate className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded">
            <MicIcon className="w-5 h-5" />
          </ComposerPrimitive.Dictate>
        </ComposerPrimitive.If>

        <ComposerPrimitive.If dictating>
          <ComposerPrimitive.StopDictation className="p-2 text-red-500 bg-red-50 rounded animate-pulse">
            <StopIcon className="w-5 h-5" />
          </ComposerPrimitive.StopDictation>
        </ComposerPrimitive.If>

        <ComposerPrimitive.If submitting>
          <ComposerPrimitive.Cancel className="p-2 text-red-500 hover:bg-red-50 rounded">
            <StopIcon className="w-5 h-5" />
          </ComposerPrimitive.Cancel>
        </ComposerPrimitive.If>

        <ComposerPrimitive.If notSubmitting>
          <ComposerPrimitive.Send className="p-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:hover:bg-blue-500">
            <SendIcon className="w-5 h-5" />
          </ComposerPrimitive.Send>
        </ComposerPrimitive.If>
      </div>
    </ComposerPrimitive.Root>
  );
}
```

## Accessing Composer State

```tsx
import { useComposer, useComposerRuntime } from "@assistant-ui/react";

function ComposerInfo() {
  // Reactive state
  const { text, attachments, isSubmitting } = useComposer();

  // Runtime API
  const runtime = useComposerRuntime();
  const handleClear = () => runtime.setText("");

  return (
    <div>
      <p>Characters: {text.length}</p>
      <p>Attachments: {attachments.length}</p>
      <button onClick={handleClear}>Clear</button>
    </div>
  );
}
```
