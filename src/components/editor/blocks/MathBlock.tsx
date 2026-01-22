"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { memo, useMemo, useCallback, useRef, useEffect, useContext } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { MathEditContext } from "../MathEditDialog";
import "./math-block.css";

// Component for rendering the math block - respects read-only state
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MathBlockContent = memo(function MathBlockContent(props: any) {
  const { block, editor } = props;
  const latex = block.props.latex || "";
  const isReadOnly = !editor.isEditable;

  // Get the math edit context (may be null if provider not wrapped)
  // Always call useContext unconditionally to follow Rules of Hooks
  const mathEdit = useContext(MathEditContext);

  // Render LaTeX to HTML using KaTeX
  const renderedHtml = useMemo(() => {
    if (!latex) {
      return '<span class="text-muted-foreground italic">Click to add math</span>';
    }
    try {
      return katex.renderToString(latex, {
        displayMode: true,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return `<span>${latex}</span>`;
    }
  }, [latex]);

  const handleSave = useCallback(
    (newLatex: string) => {
      editor.updateBlock(block, {
        props: { latex: newLatex },
      });
    },
    [editor, block]
  );

  const handleClick = useCallback(() => {
    if (!isReadOnly && mathEdit) {
      mathEdit.openDialog({
        initialLatex: latex,
        onSave: handleSave,
        title: "Edit Math Block",
      });
    }
  }, [isReadOnly, mathEdit, latex, handleSave]);

  // Track if dialog has been opened for this block instance
  const dialogOpenedRef = useRef(false);
  const handleSaveRef = useRef(handleSave);

  // Keep handleSaveRef up to date
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // Auto-open dialog when a new empty math block is created
  useEffect(() => {
    // Only open if:
    // 1. Block is editable (not read-only)
    // 2. Math edit context is available
    // 3. LaTeX is empty or just whitespace (newly created block)
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
          title: "Edit Math Block",
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

  // Always center block math, regardless of textAlignment prop
  return (
    <div
      className={`math-block-wrapper ${!isReadOnly ? "cursor-pointer" : ""}`}
      style={{ textAlign: "center" }}
      onClick={handleClick}
    >
      <div
        className="math-block-rendered"
        style={{ fontSize: "1.1em" }}
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </div>
  );
});

// Component for rendering math block in external HTML (for AI compatibility)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function MathBlockExternalHTML(props: any) {
  const latex = props.block.props.latex || "";
  // Render as a div with LaTeX in a data attribute and visible format (use $$ for Streamdown compatibility)
  return (
    <div data-math-latex={encodeURIComponent(latex)} className="math-block">
      $$$${latex}$$$$
    </div>
  );
}

// Export the Math block spec
export const MathBlock = createReactBlockSpec(
  {
    type: "math",
    propSchema: {
      // Remove textAlignment from propSchema since we always center block math
      latex: {
        default: "",
      },
    },
    content: "none",
  },
  {
    render: (props) => <MathBlockContent {...props} />,
    meta: {
      selectable: true,
    },
    // Add HTML conversion methods for AI compatibility
    toExternalHTML: (props) => <MathBlockExternalHTML {...props} />,
    parse: (element) => {
      // Try to extract LaTeX from data attribute first
      const dataLatex = element.getAttribute("data-math-latex");
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

      // Fallback: try to extract from text content (handles $$...$$ format)
      const textContent = element.textContent || "";
      const mathMatch = textContent.match(/\$\$([\s\S]*?)\$\$/);
      if (mathMatch) {
        return {
          latex: mathMatch[1].trim(),
        };
      }

      // If element doesn't match math block format, return undefined
      // This allows BlockNote to try other parsers
      return undefined;
    },
  }
);
