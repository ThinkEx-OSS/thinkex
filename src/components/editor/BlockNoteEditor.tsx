"use client"; // this registers <BlockNoteEditor> as a Client Component

import { usePostHog } from 'posthog-js/react';
import "@blocknote/core/fonts/inter.css";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import { en } from "@blocknote/core/locales";
import { useCreateBlockNote, useEditorChange, getDefaultReactSlashMenuItems, SuggestionMenuController, DefaultReactSuggestionItem, FormattingToolbarController, FormattingToolbar, getFormattingToolbarItems } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import "@blocknote/shadcn/style.css";
import { useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { schema } from "./schema";
import { uploadFile } from "@/lib/editor/upload-file";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useUIStore } from "@/lib/stores/ui-store";
import { extractTextFromSelection } from "@/lib/utils/extract-blocknote-text";
import { MathEditProvider } from "./MathEditDialog";

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

export default function BlockNoteEditor({ initialContent, onChange, readOnly, cardName, cardId, lastSource, autofocus }: BlockNoteEditorProps) {
  const isInitialMount = useRef(true);
  const previousInitialContent = useRef<string | undefined>(undefined);
  const posthog = usePostHog();
  const initStartTime = useRef<number | null>(null);

  // Get current workspace ID for Supermemory uploads
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

  // Custom paste handler to detect and handle math content and images from clipboard
  const pasteHandler = ({ event, editor, defaultPasteHandler }: any) => {
    const clipboardData = event.clipboardData;
    if (!clipboardData) {
      return defaultPasteHandler();
    }

    // Get clipboard text content
    const textContent = clipboardData.getData('text/plain');

    // Helper function to extract LaTeX from math delimiters
    // Only matches if the entire content is just math (no surrounding text)
    const extractMathContent = (text: string): { type: 'block' | 'inline'; latex: string } | null => {
      const trimmed = text.trim();

      // Check for block math: $$...$$ or \[...\]
      const blockMathMatch = trimmed.match(/^\$\$([\s\S]*?)\$\$$/) || trimmed.match(/^\\\[([\s\S]*?)\\\]$/);
      if (blockMathMatch) {
        return { type: 'block', latex: blockMathMatch[1].trim() };
      }

      // Check for inline math: $...$ or \(...\)
      // Only match if the entire content is just the math (no surrounding text)
      const inlineMathMatch = trimmed.match(/^\$([^$\n]+?)\$$/) || trimmed.match(/^\\\(([\s\S]*?)\\\)$/);
      if (inlineMathMatch) {
        return { type: 'inline', latex: inlineMathMatch[1].trim() };
      }

      return null;
    };

    // Check if clipboard contains only math content (no surrounding text)
    // This handles cases where math is selected and pasted directly
    if (textContent) {
      const mathContent = extractMathContent(textContent);

      if (mathContent) {
        const currentBlock = editor.getTextCursorPosition().block;

        if (mathContent.type === 'block') {
          // Insert block math after current block
          editor.insertBlocks(
            [
              {
                type: 'math',
                props: {
                  latex: mathContent.latex,
                },
              },
            ],
            currentBlock,
            'after'
          );
          return true;
        } else if (mathContent.type === 'inline') {
          // Insert inline math at cursor position
          editor.insertInlineContent([
            {
              type: 'inlineMath',
              props: {
                latex: mathContent.latex,
              },
            },
          ]);
          return true;
        }
      }
    }

    // Check if clipboard contains image files
    const items = Array.from(clipboardData.items) as DataTransferItem[];
    const imageItem = items.find((item: DataTransferItem) => item.type.startsWith('image/'));

    if (imageItem) {
      // Get the image file from clipboard
      const file = imageItem.getAsFile();
      if (file) {
        // Show toast that image was detected
        const toastId = toast.loading('Uploading image from clipboard...', {
          style: { color: 'white' },
        });

        // Handle upload asynchronously
        uploadFile(file, false, currentWorkspaceId, cardName)
          .then((imageUrl) => {
            // Get the current block (where cursor is)
            const currentBlock = editor.getTextCursorPosition().block;

            // Insert image block after current block
            editor.insertBlocks(
              [
                {
                  type: 'image',
                  props: {
                    url: imageUrl,
                  },
                },
              ],
              currentBlock,
              'after'
            );

            // Show success toast
            toast.success('Image uploaded successfully!', {
              id: toastId,
              style: { color: 'white' },
            });
          })
          .catch((error) => {
            console.error('Error uploading pasted image:', error);
            // Show error toast
            toast.error(error instanceof Error ? error.message : 'Failed to upload image', {
              id: toastId,
              style: { color: 'white' },
            });
            // If upload fails, fall back to default handler
            defaultPasteHandler();
          });

        // We handled the paste, so return true
        return true;
      }
    }

    // Check if clipboard contains files (not just images)
    const files = Array.from(clipboardData.files) as File[];
    const imageFile = files.find((file: File) => file.type.startsWith('image/'));

    if (imageFile) {
      // Show toast that image was detected
      const toastId = toast.loading('Uploading image from clipboard...', {
        style: { color: 'white' },
      });

      // Handle upload asynchronously
      uploadFile(imageFile, false, currentWorkspaceId, cardName)
        .then((imageUrl) => {
          // Get the current block (where cursor is)
          const currentBlock = editor.getTextCursorPosition().block;

          // Insert image block after current block
          editor.insertBlocks(
            [
              {
                type: 'image',
                props: {
                  url: imageUrl,
                },
              },
            ],
            currentBlock,
            'after'
          );

          // Show success toast
          toast.success('Image uploaded successfully!', {
            id: toastId,
            style: { color: 'white' },
          });
        })
        .catch((error) => {
          console.error('Error uploading pasted image file:', error);
          // Show error toast
          toast.error(error instanceof Error ? error.message : 'Failed to upload image', {
            id: toastId,
            style: { color: 'white' },
          });
          // If upload fails, fall back to default handler
          defaultPasteHandler();
        });

      // We handled the paste, so return true
      return true;
    }

    // No image found, use default paste handler
    return defaultPasteHandler();
  };

  // Wrapper for uploadFile that matches BlockNote's expected signature
  // BlockNote expects: (file: File, blockId?: string) => Promise<string | Record<string, any>>
  const blockNoteUploadFile = useCallback(async (file: File, blockId?: string) => {
    // Show loading toast
    const toastId = toast.loading('Uploading image...', {
      style: { color: 'white' },
    });

    try {
      // Upload the image (don't show toast in uploadFile since we're handling it here)
      // Pass workspaceId for Supermemory background upload and cardName for attachment naming
      const url = await uploadFile(file, false, currentWorkspaceId, cardName);

      // Show success toast
      toast.success('Image uploaded successfully!', {
        id: toastId,
        style: { color: 'white' },
      });

      return url;
    } catch (error) {
      // Show error toast
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload image';
      toast.error(errorMessage, {
        id: toastId,
        style: { color: 'white' },
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
    pasteHandler,
    dictionary: en,
    autofocus: autofocus ? (typeof autofocus === "boolean" ? "start" : autofocus) : false,
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

  return (
    <MathEditProvider>
      <BlockNoteView
        editor={editor}
        theme="dark"
        editable={isEditable}
        slashMenu={false}
        formattingToolbar={!isEditable || readOnly ? undefined : false}
        className={readOnly ? "" : "mt-3 mb-3"}
        shadCNComponents={
          {
            // Pass modified ShadCN components from your project here.
            // Otherwise, the default ShadCN components will be used.
          }
        }
      >
        {/* Formatting toolbar - only show for editable editors */}
        {isEditable && !readOnly && (
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar>
                {...getFormattingToolbarItems()}
              </FormattingToolbar>
            )}
          />
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
    </MathEditProvider>
  );
}

// Export the helper function for use in other components
export { plainTextToBlocks };

// Export the Block type for use in other components
export type { Block };

