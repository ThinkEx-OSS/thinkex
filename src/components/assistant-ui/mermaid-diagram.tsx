"use client";

import { useMessagePart } from "@assistant-ui/react";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import mermaid from "mermaid";
import { FC, useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/**
 * Props for the MermaidDiagram component
 */
export type MermaidDiagramProps = SyntaxHighlighterProps & {
  className?: string;
};

// Mermaid is initialized dynamically per-render based on system theme

/**
 * MermaidDiagram component for rendering Mermaid diagrams
 * Use it by passing to `componentsByLanguage` for mermaid in `markdown-text.tsx`
 *
 * @example
 * const MarkdownTextImpl = () => {
 *   return (
 *     <MarkdownTextPrimitive
 *       remarkPlugins={[remarkGfm]}
 *       className="aui-md"
 *       components={defaultComponents}
 *       componentsByLanguage={{
 *         mermaid: {
 *           SyntaxHighlighter: MermaidDiagram
 *         },
 *       }}
 *     />
 *   );
 * };
 */
export const MermaidDiagram: FC<MermaidDiagramProps> = ({
  code,
  className,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  node: _node,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  components: _components,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  language: _language,
}) => {
  const ref = useRef<HTMLPreElement>(null);
  const { resolvedTheme } = useTheme();

  // Detect when this code block is complete
  const isComplete = useMessagePart((part) => {
    if (part.type !== "text") return false;

    // Find the position of this code block
    const codeIndex = part.text.indexOf(code);
    if (codeIndex === -1) return false;

    // Check if there are closing backticks immediately after this code block
    const afterCode = part.text.substring(codeIndex + code.length);

    // Look for the closing backticks - should be at the start or after a newline
    const closingBackticksMatch = afterCode.match(/^```|^\n```/);
    return closingBackticksMatch !== null;
  });

  useEffect(() => {
    if (!isComplete) return;

    mermaid.initialize({ theme: resolvedTheme === "dark" ? "dark" : "default", startOnLoad: false });

    (async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const result = await mermaid.render(id, code);
        if (ref.current) {
          ref.current.innerHTML = result.svg;
          result.bindFunctions?.(ref.current);
        }
      } catch {
        // Silently ignore mermaid rendering failures
      }
    })();
  }, [isComplete, code, resolvedTheme]);

  return (
    <pre
      ref={ref}
      className={cn(
        "aui-mermaid-diagram rounded-b-lg bg-sidebar-accent p-2 text-center [&_svg]:mx-auto",
        className,
      )}
    >
      Drawing diagram...
    </pre>
  );
};

MermaidDiagram.displayName = "MermaidDiagram";
