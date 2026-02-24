"use client"; // this registers <BlockNoteEditor> as a Client Component

import { usePostHog } from 'posthog-js/react';
// Using system fonts instead of custom fonts
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { en } from "@blocknote/core/locales";
import { useCreateBlockNote, useEditorChange, getDefaultReactSlashMenuItems, SuggestionMenuController, DefaultReactSuggestionItem, FormattingToolbar } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { schema } from "./schema";
import { uploadFile } from "@/lib/editor/upload-file";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { searchHighlightExtension } from "./search-highlight-extension";
import { SearchQuery, setSearchState } from "prosemirror-search";
import { extractTextFromSelection } from "@/lib/utils/extract-blocknote-text";
import { MathEditProvider } from "./MathEditDialog";
import { useTheme } from "next-themes";
import * as Tooltip from "@/components/ui/tooltip";
import { Source, SourceIcon, SourceTitle } from "@/components/assistant-ui/sources";

// Get the Block type from our custom schema
type Block = (typeof schema)["Block"];

interface BlockNoteEditorProps {
  initialContent?: Block[];
  onChange?: (blocks: Block[]) => void;
  readOnly?: boolean; // Make editor read-only (for viewing on workspace cards)
  cardName?: string; // Optional card name for attachment naming
  cardId?: string; // Optional card ID for selection tracking
  lastSource?: 'user' | 'agent';
  autofocus?: boolean | "start" | "end"; // Auto-focus the editor when it opens
  sources?: Array<{ url: string; title: string }>; // Optional sources to display below editor
}

// Helper function to convert plain text to BlockNote blocks
function plainTextToBlocks(text: string): Block[] {
  if (!text || text.trim() === "") {
    return [];
  }

  // Split by newlines and create a paragraph block for each line
  const lines = text.split("\n").filter(line => line.trim() !== "");

  return lines.map((line) => ({
    type: "paragraph",
    content: [{ type: "text", text: line, styles: {} }],
  })) as Block[];
}

// Global counter to track simultaneous editor initializations
let activeEditorInitializations = 0;
let maxConcurrentInitializations = 0;

export default function BlockNoteEditor({ initialContent, onChange, readOnly, cardName, cardId, lastSource, autofocus, sources }: BlockNoteEditorProps) {
  const isInitialMount = useRef(true);
  const previousInitialContent = useRef<string | undefined>(undefined);
  const posthog = usePostHog();
  const initStartTime = useRef<number | null>(null);

  // Get current workspace ID
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

  // Get UI store actions for BlockNote selection
  const setBlockNoteSelection = useUIStore((state) => state.setBlockNoteSelection);
  const clearBlockNoteSelection = useUIStore((state) => state.clearBlockNoteSelection);

  // Track initialization (only log slow initializations to reduce noise)
  useEffect(() => {
    initStartTime.current = performance.now();
    activeEditorInitializations++;
    maxConcurrentInitializations = Math.max(maxConcurrentInitializations, activeEditorInitializations);

    return () => {
      activeEditorInitializations--;
    };
  }, [cardName, readOnly]);


  // Wrapper for uploadFile that matches BlockNote's expected signature
  // BlockNote expects: (file: File, blockId?: string) => Promise<string | Record<string, any>>
  const blockNoteUploadFile = useCallback(async (file: File, blockId?: string) => {
    // Show loading toast
    const toastId = toast.loading('Uploading image...', {
      style: { color: 'var(--foreground)' },
    });

    try {
      // Upload the image (don't show toast in uploadFile since we're handling it here)
      // Pass workspaceId and cardName for attachment naming
      const url = await uploadFile(file, false, currentWorkspaceId, cardName);

      // Show success toast
      toast.success('Image uploaded successfully!', {
        id: toastId,
        style: { color: 'var(--foreground)' },
      });

      return url;
    } catch (error) {
      // Show error toast
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload image';
      toast.error(errorMessage, {
        id: toastId,
        style: { color: 'var(--foreground)' },
      });
      throw error;
    }
  }, [currentWorkspaceId, cardName]);

  // Creates a new editor instance with custom schema
  const editorInitStart = performance.now();
  const editor = useCreateBlockNote({
    schema,
    initialContent: initialContent && initialContent.length > 0 ? initialContent : undefined,
    uploadFile: blockNoteUploadFile,
    dictionary: en,
    autofocus: autofocus ? (typeof autofocus === "boolean" ? "start" : autofocus) : false,
    extensions: cardId && !readOnly ? [searchHighlightExtension] : [],
  });

  useEffect(() => {
    const initTime = performance.now() - editorInitStart;
    const cardId = cardName || 'unknown';

    // Always log slow initializations (>200ms)
    if (initTime > 200) {
      console.warn(`[BLOCKNOTE-SLOW] Editor initialization took ${initTime.toFixed(2)}ms for card "${cardId}"`, {
        readOnly,
        hasContent: !!initialContent && initialContent.length > 0,
        contentBlocks: initialContent?.length || 0,
        activeInitializations: activeEditorInitializations,
        maxConcurrent: maxConcurrentInitializations,
      });
    }

    // Log summary if many editors initialized simultaneously
    if (maxConcurrentInitializations > 5) {
      console.warn(`[EDITOR-INIT-SUMMARY] ${maxConcurrentInitializations} editors initialized simultaneously - this may cause UI freeze`);
      maxConcurrentInitializations = 0; // Reset after logging
    }
  }, [cardName, readOnly, initialContent]);

  // Note: editable prop is handled by BlockNoteView component
  // Note: markdown is now converted to blocks on the server with math already converted to inlineMath elements
  // No client-side LaTeX processing needed - blocks always come pre-processed


  // Handle content changes
  useEditorChange((editor) => {
    if (!onChange) return;

    const currentBlocks = editor.document;

    // Call the onChange callback with proper type casting
    onChange(currentBlocks as Block[]);
  }, editor);

  // Handle text selection changes - detect when user selects text in the editor
  useEffect(() => {
    if (readOnly || !cardId || !cardName) return;

    let selectionCheckTimeout: NodeJS.Timeout | undefined;

    const checkSelection = () => {
      // Clear any pending timeout
      if (selectionCheckTimeout) {
        clearTimeout(selectionCheckTimeout);
      }

      // Debounce selection checks to avoid excessive updates
      selectionCheckTimeout = setTimeout(() => {
        try {
          // Check current store state before checking selection
          const store = useUIStore.getState();
          const currentStoreSelection = store.blockNoteSelection;
          const selection = editor.getSelection();

          if (selection && selection.blocks && selection.blocks.length > 0) {
            // Extract text from selection (cast to any to handle BlockNote's complex types)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const text = extractTextFromSelection(selection as any);

            if (text && text.trim().length > 0) {
              const trimmedText = text.trim();
              // Only update if it's different from current state
              const shouldUpdate = !currentStoreSelection ||
                currentStoreSelection.text !== trimmedText ||
                currentStoreSelection.cardId !== cardId;

              if (shouldUpdate) {
                setBlockNoteSelection({
                  cardId,
                  cardName,
                  text: trimmedText,
                });
              }
            } else {
              // Selection exists but has no text, clear it
              if (currentStoreSelection) {
                clearBlockNoteSelection();
              }
            }
          } else {
            // No selection, clear it
            if (currentStoreSelection) {
              clearBlockNoteSelection();
            }
          }
        } catch (error) {
          console.error("❌ [BlockNoteEditor] checkSelection error:", {
            error,
            cardId,
            timestamp: new Date().toISOString(),
          });
        }
      }, 100); // 100ms debounce
    };

    // Subscribe to BlockNote's selection change events instead of DOM + polling
    const cleanupOnSelectionChange = editor.onSelectionChange(() => {
      checkSelection();
    });

    // Initial check
    checkSelection();

    return () => {
      if (selectionCheckTimeout) {
        clearTimeout(selectionCheckTimeout);
      }
      cleanupOnSelectionChange?.();

      // Clear selection when editor unmounts or re-renders
      clearBlockNoteSelection();
    };
  }, [editor, readOnly, cardId, cardName, setBlockNoteSelection, clearBlockNoteSelection]);

  // Sync citationHighlightQuery from store to prosemirror-search plugin (citation highlight)
  useEffect(() => {
    if (!cardId || readOnly) return;

    const HIGHLIGHT_DURATION_MS = 2500;
    const setCitationHighlightQuery = useUIStore.getState().setCitationHighlightQuery;

    const applyHighlight = (query: string) => {
      try {
        const view = editor.prosemirrorView;
        if (!view) return;

        const { state } = view;
        const docSize = state.doc.content.size;

        const searchQuery = new SearchQuery({
          search: query,
          literal: true, // treat as plain text, escape regex chars
          caseSensitive: false,
        });
        if (!searchQuery.valid) return;

        const tr = state.tr;
        setSearchState(tr, searchQuery, { from: 0, to: docSize });
        view.dispatch(tr);

        // Scroll first match into view after DOM updates
        const result = searchQuery.findNext(state, 0, docSize);
        if (result) {
          requestAnimationFrame(() => {
            try {
              const { node } = view.domAtPos(result.from);
              const el = (node as Node).nodeType === 3 ? (node as Text).parentElement : (node as HTMLElement);
              el?.scrollIntoView({ behavior: "smooth", block: "center" });
            } catch {
              // ignore
            }
          });
        }

        // Clear highlight after a few seconds
        const timeoutId = setTimeout(() => {
          try {
            const v = editor.prosemirrorView;
            if (!v) return;
            const s = v.state;
            const clearQuery = new SearchQuery({ search: "\0", literal: true });
            const clearTr = s.tr;
            setSearchState(clearTr, clearQuery, null);
            v.dispatch(clearTr);
            setCitationHighlightQuery(null);
          } catch {
            // ignore
          }
        }, HIGHLIGHT_DURATION_MS);

        return () => clearTimeout(timeoutId);
      } catch (e) {
        console.warn("[BlockNoteEditor] Citation highlight apply failed:", e);
      }
    };

    let clearTimeoutFn: (() => void) | undefined;

    const unsub = useUIStore.subscribe((state) => {
      const hl = state.citationHighlightQuery;
      if (!hl || hl.itemId !== cardId) return;
      if (!hl.query?.trim()) return;
      clearTimeoutFn?.();
      clearTimeoutFn = applyHighlight(hl.query.trim());
    });

    // Apply immediately if we already have a matching query (e.g. note already open)
    const hl = useUIStore.getState().citationHighlightQuery;
    if (hl?.itemId === cardId && hl.query?.trim()) {
      clearTimeoutFn = applyHighlight(hl.query.trim());
    }

    return () => {
      unsub();
      clearTimeoutFn?.();
    };
  }, [editor, cardId, readOnly]);

  // Sync content ONLY when updated by AGENT (prevents cursor jumping on user input)
  useEffect(() => {
    // Only proceed if this is an update triggered by the agent
    if (lastSource !== 'agent') return;

    // Check if initialContent actually changed from previous prop
    const currentContentStr = JSON.stringify(initialContent);
    if (currentContentStr === previousInitialContent.current) return;

    previousInitialContent.current = currentContentStr;

    // Update editor content - defer to next tick to avoid flushSync warning
    // This ensures React has finished rendering before we update the editor
    queueMicrotask(() => {
      const newBlocks = (initialContent && initialContent.length > 0)
        ? initialContent
        : [{ type: "paragraph", content: [] }]; // Default empty block

      editor.replaceBlocks(editor.document, newBlocks as any);
    });
  }, [editor, initialContent, lastSource]);

  // Get math menu items (used in both AI and non-AI modes)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getMathMenuItems = (editor: any): DefaultReactSuggestionItem[] => {
    // Add Block Math item
    const blockMathItem = {
      title: "Block Math",
      onItemClick: () => {
        posthog.capture('editor_slash_menu_item_selected', { item_title: 'Block Math', item_group: 'Math' });
        editor.insertBlocks(
          [
            {
              type: "math",
            },
          ],
          editor.getTextCursorPosition().block,
          "after"
        );
      },
      aliases: ["math", "blockmath", "displaymath", "equation", "latex", "formula"],
      group: "Math",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      ),
      subtext: "Insert a block LaTeX math equation (display mode)",
    } as DefaultReactSuggestionItem;

    // Add Inline Math item
    const inlineMathItem = {
      title: "Inline Math",
      onItemClick: () => {
        posthog.capture('editor_slash_menu_item_selected', { item_title: 'Inline Math', item_group: 'Math' });
        editor.insertInlineContent([
          {
            type: "inlineMath",
            props: {
              latex: "",
            },
          },
          " ", // add a space after the inline math
        ]);
      },
      aliases: ["inlinemath", "inline", "mathinline", "latexinline"],
      group: "Math",
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
          <line x1="12" y1="5" x2="12" y2="19" />
        </svg>
      ),
      subtext: "Insert inline LaTeX math (within text)",
    } as DefaultReactSuggestionItem;

    return [blockMathItem, inlineMathItem];
  };

  // Get custom slash menu items (for non-AI mode)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getCustomSlashMenuItems = (editor: any): DefaultReactSuggestionItem[] => {
    const defaultItems = getDefaultReactSlashMenuItems(editor);
    const mathItems = getMathMenuItems(editor);
    return [...defaultItems, ...mathItems];
  };

  // Get inline math menu items
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getInlineMathMenuItems = (editor: any): DefaultReactSuggestionItem[] => {
    return [
      {
        title: "Inline Math",
        onItemClick: () => {
          posthog.capture('editor_inline_math_inserted');
          editor.insertInlineContent([
            {
              type: "inlineMath",
              props: {
                latex: "",
              },
            },
            " ", // add a space after the inline math
          ]);
        },
        subtext: "Insert inline LaTeX math",
        aliases: ["math", "latex", "formula", "equation"],
        group: "Math",
      } as DefaultReactSuggestionItem,
    ];
  };


  // Renders the editor instance using a React component
  const isEditable = readOnly !== undefined ? !readOnly : true;
  const { resolvedTheme } = useTheme();

  return (
    <MathEditProvider>
      <div className="group/editor relative w-full h-full">
        <BlockNoteView
          editor={editor}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          editable={isEditable}
          slashMenu={false}
          formattingToolbar={!isEditable || readOnly ? undefined : false}
          className={readOnly ? "" : "blocknote-with-static-toolbar"}
          shadCNComponents={{
            // Use project's portal-based Tooltip so tooltips escape overflow containers
            Tooltip: Tooltip as any,
          }}
        >
          {/* Static formatting toolbar - always visible for editable editors */}
          {isEditable && !readOnly && (
            <div className="blocknote-toolbar-wrapper transition-all duration-200 ease-in-out opacity-0 group-hover/editor:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100">
              <FormattingToolbar />
            </div>
          )}
          {/* Slash menu with math items */}
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query: string) =>
              filterSuggestionItems(getCustomSlashMenuItems(editor), query)
            }
          />
          <SuggestionMenuController
            triggerCharacter="$"
            getItems={async (query: string) =>
              filterSuggestionItems(getInlineMathMenuItems(editor), query)
            }
          />
        </BlockNoteView>
        {/* Sources section - matches streamdown/assistant-ui styling with favicon */}
        {sources && sources.length > 0 && (
          <div className="px-14 pb-6 pt-8 border-t border-border/40">
            <div className="text-xs font-semibold text-muted-foreground/70 mb-3 uppercase tracking-wider">
              Sources
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sources.map((source, index) => {
                const domain = (() => {
                  try {
                    return new URL(source.url).hostname.replace(/^www\./, "");
                  } catch {
                    return source.url;
                  }
                })();
                const displayTitle = source.title || domain;
                return (
                  <Source
                    key={index}
                    href={source.url}
                    variant="outline"
                    size="default"
                    className="inline-flex"
                  >
                    <SourceIcon url={source.url} />
                    <SourceTitle>{displayTitle}</SourceTitle>
                  </Source>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </MathEditProvider>
  );
}

// Export the helper function for use in other components
export { plainTextToBlocks };

// Export the Block type for use in other components
export type { Block };

