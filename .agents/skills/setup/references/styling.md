# Styling Guide

Options for styling assistant-ui components.

## Quick Decision

```
Using Tailwind CSS?
├─ Yes
│  ├─ Want pre-built components? → Use Thread with className
│  └─ Want full control? → Use Primitives with Tailwind classes
└─ No
   └─ Import @assistant-ui/styles/default.css
```

## Option 1: Pre-built CSS (No Tailwind)

Simplest approach for projects without Tailwind.

```bash
npm install @assistant-ui/styles
```

```tsx
// In your root layout or _app
import "@assistant-ui/styles/default.css";

function App() {
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <Thread />  {/* Fully styled */}
    </AssistantRuntimeProvider>
  );
}
```

### Available Stylesheets

- `@assistant-ui/styles/default.css` - Full thread styles
- `@assistant-ui/styles/modal.css` - Modal/popup styles
- `@assistant-ui/styles/markdown.css` - Markdown content styles

## Option 2: Tailwind CSS

### Configure Tailwind

```js
// tailwind.config.js
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    // Include assistant-ui components
    "./node_modules/@assistant-ui/react/dist/**/*.js",
  ],
  // ...
};
```

### Use with Pre-built Components

```tsx
import { Thread } from "@assistant-ui/react";

function Chat() {
  return (
    <Thread
      className="h-full bg-white dark:bg-gray-900"
    />
  );
}
```

### Use with Primitives

```tsx
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";

function CustomThread() {
  return (
    <ThreadPrimitive.Root className="flex flex-col h-full bg-gray-50">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-4">
        <ThreadPrimitive.Messages
          components={{
            UserMessage: () => (
              <MessagePrimitive.Root className="flex justify-end mb-4">
                <div className="bg-blue-500 text-white rounded-lg px-4 py-2 max-w-[80%]">
                  <MessagePrimitive.Content />
                </div>
              </MessagePrimitive.Root>
            ),
            AssistantMessage: () => (
              <MessagePrimitive.Root className="flex mb-4">
                <div className="bg-gray-200 rounded-lg px-4 py-2 max-w-[80%]">
                  <MessagePrimitive.Content />
                </div>
              </MessagePrimitive.Root>
            ),
          }}
        />
      </ThreadPrimitive.Viewport>

      <ComposerPrimitive.Root className="border-t p-4 flex gap-2">
        <ComposerPrimitive.Input
          className="flex-1 rounded-lg border px-4 py-2 focus:outline-none focus:ring-2"
          placeholder="Type a message..."
        />
        <ComposerPrimitive.Send className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600">
          Send
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}
```

## Option 3: CSS Variables

Customize via CSS variables:

```css
:root {
  /* Primary colors */
  --aui-primary: #3b82f6;
  --aui-primary-foreground: #ffffff;

  /* Background */
  --aui-background: #ffffff;
  --aui-foreground: #1f2937;

  /* Messages */
  --aui-user-message-bg: #3b82f6;
  --aui-assistant-message-bg: #f3f4f6;

  /* Borders */
  --aui-border: #e5e7eb;
  --aui-border-radius: 0.5rem;

  /* Typography */
  --aui-font-family: system-ui, sans-serif;
  --aui-font-size: 0.875rem;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --aui-background: #111827;
    --aui-foreground: #f9fafb;
    --aui-assistant-message-bg: #374151;
  }
}
```

## Component-Specific Styling

### Thread

```tsx
<Thread
  className="h-[600px] max-w-2xl mx-auto"
  style={{ "--aui-primary": "#8b5cf6" }}
/>
```

### Composer

```tsx
<ComposerPrimitive.Root className="sticky bottom-0 bg-white border-t">
  <ComposerPrimitive.Input
    className="w-full resize-none"
    rows={3}
  />
</ComposerPrimitive.Root>
```

### Messages

```tsx
<MessagePrimitive.Root
  className={cn(
    "mb-4 flex",
    isUser ? "justify-end" : "justify-start"
  )}
>
  <MessagePrimitive.Content />
</MessagePrimitive.Root>
```

## Dark Mode

### With Tailwind

```tsx
<ThreadPrimitive.Root className="bg-white dark:bg-gray-900">
  {/* Components inherit dark mode */}
</ThreadPrimitive.Root>
```

### With CSS

```css
@media (prefers-color-scheme: dark) {
  .aui-thread {
    --aui-background: #1a1a1a;
    --aui-foreground: #ffffff;
  }
}

/* Or with class-based dark mode */
.dark .aui-thread {
  --aui-background: #1a1a1a;
}
```

## Common Patterns

### Full-Height Thread

```tsx
<div className="h-screen">
  <Thread className="h-full" />
</div>
```

### Chat in Modal

```tsx
import { AssistantModal } from "@assistant-ui/react";

<AssistantModal className="fixed bottom-4 right-4 w-96 h-[500px]" />
```

### Sticky Composer

```tsx
<ThreadPrimitive.Root className="flex flex-col h-full">
  <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto">
    {/* Messages */}
  </ThreadPrimitive.Viewport>
  <ComposerPrimitive.Root className="sticky bottom-0">
    {/* Input */}
  </ComposerPrimitive.Root>
</ThreadPrimitive.Root>
```
