"use client";

import { Streamdown } from "streamdown";
import { useMessagePartText } from "@assistant-ui/react";
import { useAssistantState } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import React, { memo, useRef, useEffect } from "react";

const MarkdownTextImpl = () => {
  // Get the text content from assistant-ui context
  const { text } = useMessagePartText();

  // Get thread and message ID for unique key per message
  const threadId = useAssistantState(({ threads }) => (threads as any)?.mainThreadId);
  const messageId = useAssistantState(({ message }) => (message as any)?.id);

  // Check if the message is currently streaming
  const isRunning = useAssistantState(({ thread }) => (thread as any)?.isRunning ?? false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Combine thread and message ID for unique key per message
  const key = `${threadId || 'no-thread'}-${messageId || 'no-message'}`;

  // Set up wheel event handlers for all code blocks to prevent vertical scroll trapping
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      const preElement = target.closest('pre');

      if (!preElement) return;

      // If user is primarily scrolling vertically (more vertical than horizontal movement)
      const isVerticalScroll = Math.abs(e.deltaY) > Math.abs(e.deltaX);

      if (isVerticalScroll) {
        // Always let vertical scroll bubble up to parent - don't let code block trap it
        const scrollParent = preElement.closest('.aui-thread-viewport') as HTMLElement;
        if (scrollParent) {
          scrollParent.scrollTop += e.deltaY;
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });

    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [threadId, messageId]);

  // Preprocess the text to normalize custom math tags
  const processedText = normalizeCustomMathTags(text);

  return (
    <div key={key} ref={containerRef} className="aui-md">
      <Streamdown
        isAnimating={isRunning}
        shikiTheme={['github-dark', 'github-dark']}
        className={cn(
          "streamdown-content size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        )}
        components={{
          ol: ({ children }) => (
            <ol className="ml-4 list-outside list-decimal whitespace-normal">
              {children}
            </ol>
          ),
          ul: ({ children }) => (
            <ul className="ml-4 list-outside list-disc whitespace-normal">
              {children}
            </ul>
          ),
        }}
        mermaid={{
          config: {
            theme: 'dark',
          },
        }}
      >
        {processedText}
      </Streamdown>
    </div>
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

function normalizeCustomMathTags(input: string): string {
  return (
    input
      // Convert \( ... \) to $$...$$ (inline math) - streamdown uses $$ for both, inline has no newlines
      .replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, (_, content) => `$$${content.trim()}$$`)
      // Convert \[ ... \] to $$...$$ (block math) - streamdown needs newlines for block triggers
      .replace(/\\{1,2}\[([\s\S]*?)\\{1,2}\]/g, (_, content) => `$$\n${content.trim()}\n$$`)
  );
}