"use client";

import { Streamdown, defaultRehypePlugins } from "streamdown";
import { createCodePlugin } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";

// Create code plugin with one-dark-pro theme
const code = createCodePlugin({
  themes: ['one-dark-pro', 'one-dark-pro'],
});
import { useMessagePartText } from "@assistant-ui/react";
import { useAuiState } from "@assistant-ui/react";
import { cn } from "@/lib/utils";
import React, { memo, useRef, useEffect } from "react";
import type { AnchorHTMLAttributes, HTMLAttributes } from "react";
import { MarkdownLink } from "@/components/ui/markdown-link";

/**
 * Normalize various LaTeX delimiter formats to $$...$$ which is what
 * @streamdown/math (remark-math with singleDollarTextMath: false) expects.
 * LLMs often emit \(...\) or \[...\] despite system prompt instructions.
 */
function normalizeLatexDelimiters(input: string): string {
  return (
    input
      // Convert [/math]...[/math] to $$...$$ (block math)
      .replace(/\[\/math\]([\s\S]*?)\[\/math\]/g, (_, content) => `$$${content.trim()}$$`)
      // Convert [/inline]...[/inline] to $$...$$ (inline math)
      .replace(/\[\/inline\]([\s\S]*?)\[\/inline\]/g, (_, content) => `$$${content.trim()}$$`)
      // Convert \( ... \) to $$...$$ (inline math) - handles both single and double backslashes
      .replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, (_, content) => `$$${content.trim()}$$`)
      // Convert \[ ... \] to $$...$$ (block math) - handles both single and double backslashes
      .replace(/\\{1,2}\[([\s\S]*?)\\{1,2}\]/g, (_, content) => `\n$$${content.trim()}$$\n`)
  );
}

const MarkdownTextImpl = () => {
  // Get the text content from assistant-ui context
  const { text } = useMessagePartText();

  // Get thread and message ID for unique key per message
  const threadId = useAuiState(({ threads }) => (threads as any)?.mainThreadId);
  const messageId = useAuiState(({ message }) => (message as any)?.id);

  // Check if the message is currently streaming
  const isRunning = useAuiState(({ thread }) => (thread as any)?.isRunning ?? false);

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

  // Ensure copied content keeps rich HTML but strips background/highlight styles
  const handleCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    if (typeof window === "undefined") return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();

    // Wrap in a temporary container so we can serialize + sanitize
    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);

    // Strip background-related inline styles so no highlight color is preserved
    wrapper.querySelectorAll<HTMLElement>("*").forEach((el) => {
      const style = el.style;
      if (!style) return;

      // Remove background colors/highlights while leaving other styling intact
      style.removeProperty("background");
      style.removeProperty("background-color");
      // Lines 88-89 already remove background/background-color, so this line can be deleted
    });

    const html = wrapper.innerHTML;
    const plainText = wrapper.textContent ?? "";

    if (!html && !plainText) return;

    event.preventDefault();
    if (html) {
      event.clipboardData.setData("text/html", html);
    }
    if (plainText) {
      event.clipboardData.setData("text/plain", plainText);
    }
  };

  return (
    <div key={key} ref={containerRef} className="aui-md" onCopy={handleCopy}>
      <Streamdown
        isAnimating={isRunning}
        caret="block"
        className={cn(
          "streamdown-content size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        )}
        linkSafety={{ enabled: false }}
        plugins={{
          code: code,
          mermaid: mermaid,
          math: math,
        }}
        rehypePlugins={[
          defaultRehypePlugins.raw,
          defaultRehypePlugins.sanitize,
          [
            // @ts-ignore - accessing internal harden plugin
            defaultRehypePlugins.harden[0],
            {
              allowedLinkPrefixes: ["*"],
              allowedImagePrefixes: ["*"],
              allowedProtocols: ["*"],
              allowDataImages: true,
            }
          ]
        ]}
        components={{
          a: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: any }) => (
            <MarkdownLink {...props} />
          ),
          ol: ({ children, node, ...props }: HTMLAttributes<HTMLOListElement> & { node?: any }) => (
            <ol className="ml-4 list-outside list-decimal whitespace-normal" {...props}>
              {children}
            </ol>
          ),
          ul: ({ children, node, ...props }: HTMLAttributes<HTMLUListElement> & { node?: any }) => (
            <ul className="ml-4 list-outside list-disc whitespace-normal" {...props}>
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
        {normalizeLatexDelimiters(text)}
      </Streamdown>
    </div>
  );
};


export const MarkdownText = memo(MarkdownTextImpl);
