"use client";

import { createReactInlineContentSpec } from "@blocknote/react";
import { memo, useMemo, useCallback, useRef, useEffect, useContext } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { MathEditContext } from "../MathEditDialog";
import "../blocks/math-block.css";

// Component for rendering inline math - respects read-only state
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const InlineMathContent = memo(function InlineMathContent({ inlineContent, editor, updateInlineContent }: any) {
  const latex = inlineContent.props.latex || "";
  const isReadOnly = !editor.isEditable;

  // Get the math edit context (may be null if provider not wrapped)
  // Always call useContext unconditionally to follow Rules of Hooks
  const mathEdit = useContext(MathEditContext);

  // Render LaTeX to HTML using KaTeX
  const renderedHtml = useMemo(() => {
    if (!latex) {
      return '<span class="text-muted-foreground italic">math</span>';
    }
    try {
      return katex.renderToString(latex, {
        displayMode: false,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return `<span>${latex}</span>`;
    }
  }, [latex]);

  const handleSave = useCallback(
    (newLatex: string) => {
      updateInlineContent({
        type: inlineContent.type,
        props: {
          ...inlineContent.props,
          latex: newLatex,
        },
      });
    },
    [inlineContent, updateInlineContent]
  );

  const handleClick = useCallback(() => {
    if (!isReadOnly && mathEdit) {
      mathEdit.openDialog({
        initialLatex: latex,
        onSave: handleSave,
        title: "Edit Inline Math",
      });
    }
  }, [isReadOnly, mathEdit, latex, handleSave]);

  // Track if dialog has been opened for this inline math instance
  const dialogOpenedRef = useRef(false);
  const handleSaveRef = useRef(handleSave);

  // Keep handleSaveRef up to date
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // Auto-open dialog when a new empty inline math is created
  useEffect(() => {
    // Only open if:
    // 1. Editor is editable (not read-only)
    // 2. Math edit context is available
    // 3. LaTeX is empty or just whitespace (newly created inline math)
    // 4. Dialog hasn't been opened yet for this instance
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    
    if (
      !isReadOnly &&
      mathEdit &&
      !latex.trim() &&
      !dialogOpenedRef.current
    ) {
      dialogOpenedRef.current = true;
      // Use setTimeout to ensure the dialog opens after the component is fully mounted
      timeoutId = setTimeout(() => {
        mathEdit.openDialog({
          initialLatex: "",
          onSave: handleSaveRef.current,
          title: "Edit Inline Math",
        });
      }, 0);
    }

    // Cleanup: clear timeout if component unmounts or dependencies change
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isReadOnly, mathEdit, latex]);

  return (
    <span
      className={`inline-math ${!isReadOnly ? "cursor-pointer hover:bg-white/10" : ""}`}
      style={{
        display: "inline-block",
        verticalAlign: "middle",
        padding: "2px 4px",
        borderRadius: "4px",
        transition: "background-color 0.15s ease",
      }}
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
});

// Component for rendering inline math in external HTML (for AI compatibility)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function InlineMathExternalHTML(props: any) {
  const latex = props.inlineContent.props.latex || "";
  // Render as a span with LaTeX in a data attribute and visible format (use $$ for Streamdown compatibility)
  return (
    <span data-inline-math-latex={encodeURIComponent(latex)} className="inline-math">
      $$$${latex}$$$$
    </span>
  );
}

// Export the InlineMath spec
export const InlineMath = createReactInlineContentSpec(
  {
    type: "inlineMath",
    propSchema: {
      latex: {
        default: "",
      },
    },
    content: "none",
  },
  {
    render: (props) => <InlineMathContent {...props} />,
    // Add HTML conversion methods for AI compatibility
    toExternalHTML: (props) => <InlineMathExternalHTML {...props} />,
    parse: (element) => {
      // Try to extract LaTeX from data attribute first
      const dataLatex = element.getAttribute("data-inline-math-latex");
      if (dataLatex) {
        try {
          return {
            latex: decodeURIComponent(dataLatex),
          };
        } catch {
          // If decoding fails, use the raw value
          return {
            latex: dataLatex,
          };
        }
      }

      // Fallback: try to extract from text content (handles $...$ format)
      const textContent = element.textContent || "";
      const mathMatch = textContent.match(/\$([^$\n]+?)\$/);
      if (mathMatch) {
        return {
          latex: mathMatch[1].trim(),
        };
      }

      // If element doesn't match inline math format, return undefined
      // This allows BlockNote to try other parsers
      return undefined;
    },
  }
);
