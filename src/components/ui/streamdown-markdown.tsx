"use client";

import { Streamdown, defaultRehypePlugins } from "streamdown";
import { createCodePlugin } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cn } from "@/lib/utils";
import React, { memo } from "react";

// Create code plugin with one-dark-pro theme
const code = createCodePlugin({
  themes: ['one-dark-pro', 'one-dark-pro'],
});

interface StreamdownMarkdownProps {
  children: string;
  className?: string;
}

/**
 * Streamdown-based markdown component that uses $$...$$ for all math
 * This replaces ReactMarkdown to ensure consistent math syntax across the app
 */
const StreamdownMarkdownImpl: React.FC<StreamdownMarkdownProps> = ({ 
  children, 
  className 
}) => {
  // Normalize math syntax to Streamdown format
  const normalizedContent = children
    // Convert \( ... \) to $$...$$ (inline math)
    .replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, (_, content) => `$$${content.trim()}$$`)
    // Convert \[ ... \] to $$...$$ (block math)
    .replace(/\\{1,2}\[([\s\S]*?)\\{1,2}\]/g, (_, content) => `$$\n${content.trim()}\n$$`)
    // Convert single $ ... $ to $$...$$ (inline math), but avoid currency like $10 or $5.50
    .replace(/(?<!\\)(?<!\$)\$(?!\$)([^$\n]+?)(?<!\\)(?<!\$)\$(?!\$)/g, (match, content) => {
      // Check if this looks like currency (numbers with optional decimals)
      if (/^\d+(\.\d{1,2})?$/.test(content.trim())) {
        return match; // Keep as currency
      }
      return `$$${content}$$`;
    });

  return (
    <div className={cn("aui-md", className)}>
      <Streamdown
        caret="block"
        className="streamdown-content size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
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
        {normalizedContent}
      </Streamdown>
    </div>
  );
};

export const StreamdownMarkdown = memo(StreamdownMarkdownImpl);
StreamdownMarkdown.displayName = "StreamdownMarkdown";
