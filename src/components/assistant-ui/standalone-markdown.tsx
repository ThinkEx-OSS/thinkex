"use client";

// import "@assistant-ui/react-markdown/styles/dot.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import React, { type FC, memo, useState } from "react";
import { CheckIcon, CopyIcon } from "lucide-react";
import ShikiHighlighter from "react-shiki";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";
import type { Components } from "react-markdown";

interface StandaloneMarkdownProps {
  children: string;
  className?: string;
}

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number;
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false);

  const copyToClipboard = (value: string) => {
    if (!value) return;

    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), copiedDuration);
    });
  };

  return { isCopied, copyToClipboard };
};

const CodeHeader: FC<{ language?: string; code: string }> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="aui-code-header-root mt-4 flex items-center justify-between gap-4 rounded-t-lg bg-sidebar-accent px-4 py-2 text-sm font-semibold text-foreground">
      <span className="aui-code-header-language lowercase [&>span]:text-xs">
        {language || "code"}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && <CopyIcon />}
        {isCopied && <CheckIcon />}
      </TooltipIconButton>
    </div>
  );
};

function normalizeCustomMathTags(input: string): string {
  return (
    input
      // Convert [/math]...[/math] to $$...$$ (legacy block math format)
      .replace(/\[\/math\]([\s\S]*?)\[\/math\]/g, (_, content) => `$$${content.trim()}$$`)
      // Convert [/inline]...[/inline] to $$...$$ (legacy inline format - Streamdown uses $$ for all)
      .replace(/\[\/inline\]([\s\S]*?)\[\/inline\]/g, (_, content) => `$$${content.trim()}$$`)
      // Convert \( ... \) to $$...$$ (LaTeX inline math - Streamdown uses $$ for all)
      .replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, (_, content) => `$$${content.trim()}$$`)
      // Convert \[ ... \] to $$...$$ (LaTeX block math)
      .replace(/\\{1,2}\[([\s\S]*?)\\{1,2}\]/g, (_, content) => `$$${content.trim()}$$`)
  );
}

const components: Components = {
  h1: ({ className, ...props }) => (
    <h1
      className={cn(
        "aui-md-h1 mb-8 scroll-m-20 text-4xl font-extrabold tracking-tight last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      className={cn(
        "aui-md-h2 mt-8 mb-4 scroll-m-20 text-3xl font-semibold tracking-tight first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      className={cn(
        "aui-md-h3 mt-6 mb-4 scroll-m-20 text-2xl font-semibold tracking-tight first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      className={cn(
        "aui-md-h4 mt-6 mb-4 scroll-m-20 text-xl font-semibold tracking-tight first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      className={cn(
        "aui-md-h5 my-4 text-lg font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      className={cn(
        "aui-md-h6 my-4 font-semibold first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      className={cn(
        "aui-md-p mt-5 mb-5 leading-7 first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "aui-md-a font-medium text-primary underline underline-offset-4",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn("aui-md-blockquote border-l-2 pl-6 italic", className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn("aui-md-ul my-5 ml-6 list-disc [&>li]:mt-2 text-sm", className)}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn("aui-md-ol my-5 ml-6 list-decimal [&>li]:mt-2 text-sm", className)}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("aui-md-hr my-5 border-b", className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <table
      className={cn(
        "aui-md-table my-5 w-full border-separate border-spacing-0 overflow-y-auto text-sm",
        className,
      )}
      {...props}
    />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "aui-md-th bg-muted px-4 py-2 text-left font-bold first:rounded-tl-lg last:rounded-tr-lg [&[align=center]]:text-center [&[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "aui-md-td border-b border-l px-4 py-2 text-left last:border-r [&[align=center]]:text-center [&[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        "aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-bl-lg [&:last-child>td:last-child]:rounded-br-lg",
        className,
      )}
      {...props}
    />
  ),
  sup: ({ className, ...props }) => (
    <sup
      className={cn("aui-md-sup [&>a]:text-xs [&>a]:no-underline", className)}
      {...props}
    />
  ),
  pre: ({ className, children, ...props }: any) => {
    const codeElement = React.Children.toArray(children)[0] as any;
    if (codeElement && codeElement.type === 'code') {
      const codeProps = codeElement.props || {};
      const language = codeProps.className?.replace(/^language-/, "") || "";
      const code = typeof codeProps.children === 'string'
        ? codeProps.children
        : Array.isArray(codeProps.children)
          ? codeProps.children.join('')
          : String(codeProps.children || '');

      if (language && code) {
        return (
          <div>
            <CodeHeader language={language} code={code} />
            <ShikiHighlighter
              language={language}
              theme="one-dark-pro"
              addDefaultStyles={false}
              showLanguage={false}
              defaultColor="light-dark()"
              className={cn(
                "aui-shiki-base [&_pre]:overflow-x-auto [&_pre]:rounded-b-lg [&_pre]:!bg-sidebar-accent [&_pre]:p-4 [&_*]:opacity-100"
              )}
            >
              {code.trim()}
            </ShikiHighlighter>
          </div>
        );
      }
    }

    return (
      <pre
        className={cn(
          "aui-md-pre overflow-x-auto !rounded-t-none rounded-b-lg bg-black p-4 text-white",
          className,
        )}
        {...props}
      >
        {children}
      </pre>
    );
  },
  code: ({ className, inline, ...props }: any) => {
    if (inline) {
      return (
        <code
          className={cn(
            "aui-md-inline-code rounded border bg-muted font-semibold",
            className,
          )}
          {...props}
        />
      );
    }
    return <code className={className} {...props} />;
  },
};

/**
 * Standalone markdown component that doesn't require MessagePartText.
 * Can be used in tool UI components or anywhere outside of message parts.
 * Supports GFM, math, and syntax highlighting, but not mermaid diagrams.
 */
const StandaloneMarkdownImpl: FC<StandaloneMarkdownProps> = ({
  children,
  className
}) => {
  const normalizedContent = normalizeCustomMathTags(children);

  return (
    <div className={cn("aui-md", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
};

export const StandaloneMarkdown = memo(StandaloneMarkdownImpl);
StandaloneMarkdown.displayName = "StandaloneMarkdown";

