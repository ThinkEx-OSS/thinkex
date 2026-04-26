"use client";

import { Streamdown, type CodeHighlighterPlugin } from "streamdown";
import { createCodePlugin } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { createMathPlugin } from "@streamdown/math";
import { cn } from "@/lib/utils";
import React, { memo } from "react";
import type { AnchorHTMLAttributes, HTMLAttributes } from "react";
import { MarkdownLink } from "@/components/ui/markdown-link";
import { preprocessLatex } from "@/lib/utils/preprocess-latex";

const math = createMathPlugin({ singleDollarTextMath: true });

const code = createCodePlugin() as CodeHighlighterPlugin;

type MermaidErrorFallbackProps = {
  chart: string;
  error: string;
  retry: () => void;
};

const MermaidErrorFallback = (_props: MermaidErrorFallbackProps) => (
  <div className="my-2 text-xs text-muted-foreground">
    AI failed to create diagram.
  </div>
);

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
    <div className={cn(className)}>
      <Streamdown
        className="streamdown-content size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        linkSafety={{ enabled: false }}
        plugins={{ code, mermaid, math }}
        components={{
          a: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: any }) => (
            <MarkdownLink {...props} />
          ),
          ol: ({ children, node: _node, ...props }: HTMLAttributes<HTMLOListElement> & { node?: any }) => (
            <ol className="ml-4 list-outside list-decimal whitespace-normal" {...props}>
              {children}
            </ol>
          ),
          ul: ({ children, node: _node, ...props }: HTMLAttributes<HTMLUListElement> & { node?: any }) => (
            <ul className="ml-4 list-outside list-disc whitespace-normal" {...props}>
              {children}
            </ul>
          ),
        }}
        mermaid={{
          config: {
            theme: 'dark',
          },
          errorComponent: MermaidErrorFallback,
        }}
      >
        {preprocessLatex(children)}
      </Streamdown>
    </div>
  );
};

export const StreamdownMarkdown = memo(StreamdownMarkdownImpl);
StreamdownMarkdown.displayName = "StreamdownMarkdown";
