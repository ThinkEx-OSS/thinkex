"use client";

import { Streamdown } from "streamdown";
import { createCodePlugin } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { createMathPlugin } from "@streamdown/math";
import { cn } from "@/lib/utils";
import React, { memo } from "react";
import type { AnchorHTMLAttributes, HTMLAttributes } from "react";
import { MarkdownLink } from "@/components/ui/markdown-link";
import { preprocessLatex } from "@/lib/utils/preprocess-latex";

const math = createMathPlugin({ singleDollarTextMath: true });

// Create code plugin with one-dark-pro theme
const code = createCodePlugin({
  themes: ['one-dark-pro', 'one-dark-pro'],
});

interface StreamdownMarkdownProps {
  children: string;
  className?: string;
}

/**
 * Streamdown-based markdown component with native math support
 * This replaces ReactMarkdown and relies on Streamdown's built-in math processing
 */
const StreamdownMarkdownImpl: React.FC<StreamdownMarkdownProps> = ({ 
  children, 
  className 
}) => {
  return (
    <div className={cn("aui-md", className)}>
      <Streamdown
        caret="block"
        className="streamdown-content size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        linkSafety={{ enabled: false }}
        plugins={{ code, mermaid, math }}
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
        {preprocessLatex(children)}
      </Streamdown>
    </div>
  );
};

export const StreamdownMarkdown = memo(StreamdownMarkdownImpl);
StreamdownMarkdown.displayName = "StreamdownMarkdown";
