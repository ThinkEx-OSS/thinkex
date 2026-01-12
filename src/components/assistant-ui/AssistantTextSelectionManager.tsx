"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, FileText, Highlighter, CheckIcon, Plus } from "lucide-react";
import { FaQuoteRight } from "react-icons/fa6";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { HighlightTooltip, TooltipAction } from "@/components/ui/highlight-tooltip";
import SelectableText, {
  TextHighlight,
  SelectionInfo,
  SelectableTextRef
} from "@/components/workspace-canvas/SelectableText";
import { useUIStore, selectReplySelections } from "@/lib/stores/ui-store";
import { getHighlightColorById } from "@/lib/utils/highlight-colors";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useAssistantState } from "@assistant-ui/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";

interface AssistantTextSelectionManagerProps {
  className?: string;
  onSingleSelect?: (text: string, range?: Range) => void | Promise<void>;
  onMultiSelect?: (selections: Array<{ text: string; id: string; range?: Range }>) => void | Promise<void>;
}

export default function AssistantTextSelectionManager({
  className,
  onSingleSelect,
  onMultiSelect,
}: AssistantTextSelectionManagerProps) {
  // Use Zustand store for multi-select mode and tooltip visibility
  const inMultiMode = useUIStore((state) => state.inMultiSelectMode);
  const tooltipVisible = useUIStore((state) => state.tooltipVisible);
  const setTooltipVisible = useUIStore((state) => state.setTooltipVisible);
  const enterMultiSelectMode = useUIStore((state) => state.enterMultiSelectMode);
  const exitMultiSelectMode = useUIStore((state) => state.exitMultiSelectMode);
  const selectedHighlightColorId = useUIStore((state) => state.selectedHighlightColorId);
  const addReplySelection = useUIStore((state) => state.addReplySelection);
  const clearReplySelections = useUIStore((state) => state.clearReplySelections);

  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const lastTooltipPositionRef = useRef({ x: 0, y: 0 });
  const [highlights, setHighlights] = useState<TextHighlight[]>([]);
  const [currentSelection, setCurrentSelection] = useState<SelectionInfo | null>(null);
  const [triggerAddHighlight, setTriggerAddHighlight] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const selectionTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const selectableTextRef = useRef<SelectableTextRef>(null);
  const [multiModeBasePosition, setMultiModeBasePosition] = useState<{ x: number; y: number } | null>(null);
  const lastHighlightElementRef = useRef<HTMLElement | null>(null); // Store last highlight element for immediate access
  const multiModeMarkerElementRef = useRef<HTMLElement | null>(null); // Store marker element for multi-mode tracking
  const markerToMouseOffsetRef = useRef<{ x: number; y: number } | null>(null); // Store offset from marker to mouse position

  // Track if user is actively scrolling to prevent position updates in multi mode
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Dialog state for multi-select
  const [showMultiSelectDialog, setShowMultiSelectDialog] = useState(false);
  const [multiSelectionsForDialog, setMultiSelectionsForDialog] = useState<Array<{ text: string; id: string; messageContext?: string; userPrompt?: string }>>([]);
  const [multiSelectAnnotation, setMultiSelectAnnotation] = useState("");
  const [isSubmittingMulti, setIsSubmittingMulti] = useState(false);

  // Dialog state for negative feedback (trash)
  const [showNegativeFeedbackDialog, setShowNegativeFeedbackDialog] = useState(false);
  const [negativeFeedbackAnnotation, setNegativeFeedbackAnnotation] = useState("");
  const [negativeSelectionForDialog, setNegativeSelectionForDialog] = useState("");
  const [negativeMessageContextForDialog, setNegativeMessageContextForDialog] = useState("");
  const [negativeUserPromptForDialog, setNegativeUserPromptForDialog] = useState("");
  const [isSubmittingNegative, setIsSubmittingNegative] = useState(false);


  // Store message contexts for highlights
  const highlightMessageContexts = useRef<Map<string, string>>(new Map());
  // Store user prompts for highlights
  const highlightUserPrompts = useRef<Map<string, string>>(new Map());
  // Store pending contexts that are waiting to be associated with a highlight
  const pendingContexts = useRef<Array<{ text: string; context: string; userPrompt: string }>>([]);

  // Get workspace ID
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const queryClient = useQueryClient();

  // Get current thread ID from assistant-ui
  // This component is always rendered within AssistantRuntimeProvider, so the hook is safe to use
  // Use threadListItem.id if available, otherwise fall back to mainThreadId
  // Using safe hooks to handle race condition during thread switching (GitHub issue #2722)
  const threadListItemId = useAssistantState(({ threadListItem }) => (threadListItem as any)?.id);
  const mainThreadId = useAssistantState(({ threads }) => (threads as any)?.mainThreadId);
  const currentThreadId = threadListItemId || mainThreadId;







  // Remove marker element from DOM
  const removeMarkerElement = useCallback(() => {
    if (multiModeMarkerElementRef.current) {
      try {
        const marker = multiModeMarkerElementRef.current;
        const parent = marker.parentNode;

        // Check if element has a parent and is still a child before removing
        if (parent) {
          // Double-check that the element is still a child of the parent
          if (parent.contains(marker)) {
            try {
              parent.removeChild(marker);
            } catch (error) {
              // Element may have been removed by another process
              // This can happen during thread switches when DOM is being cleaned up
            }
          }
        }
      } catch (error) {
        // Element may already be removed or DOM is in an invalid state
        // This can happen when thread switches and DOM is being cleaned up
      } finally {
        // Always clear the ref, even if removal failed
        multiModeMarkerElementRef.current = null;
        markerToMouseOffsetRef.current = null;
      }
    } else {
      markerToMouseOffsetRef.current = null;
    }
  }, []);

  // Create an invisible marker element at the Range position for multi-mode tracking
  const createMarkerElementAtRange = useCallback((range: Range): HTMLElement | null => {
    try {
      const originalRect = range.getBoundingClientRect();

      // Clone the range to avoid modifying the original
      const clonedRange = range.cloneRange();

      // Create an invisible inline span element that tracks with content flow
      const marker = document.createElement('span');
      marker.setAttribute('data-multi-mode-marker', 'true');
      marker.style.cssText = 'display: inline; width: 0; height: 0; visibility: hidden; pointer-events: none; overflow: hidden; position: relative; line-height: 0; font-size: 0;';

      // Insert a zero-width space to ensure the element has content but is invisible
      marker.textContent = '\u200B'; // Zero-width space

      // Collapse the range to the start position
      clonedRange.collapse(true);

      // Try to insert the marker at the start of the range
      try {
        clonedRange.insertNode(marker);
        return marker;
      } catch (error) {
        // If insertNode fails, try to insert before the start container
        try {
          const startContainer = clonedRange.startContainer;
          if (startContainer.nodeType === Node.TEXT_NODE) {
            // For text nodes, we need to split and insert
            const textNode = startContainer as Text;
            const parent = textNode.parentNode;
            const offset = clonedRange.startOffset;

            if (parent && offset === 0) {
              // Insert before the text node
              parent.insertBefore(marker, textNode);
              return marker;
            } else if (parent && offset < textNode.length) {
              // Split the text node and insert between
              const beforeText = textNode.splitText(offset);
              parent.insertBefore(marker, beforeText);
              return marker;
            }
          } else {
            // For element nodes, try to insert at the start offset
            const element = startContainer as Element;
            if (element.children.length > 0 && clonedRange.startOffset > 0) {
              const child = element.children[clonedRange.startOffset - 1];
              if (child.nextSibling) {
                element.insertBefore(marker, child.nextSibling);
                return marker;
              }
            }
            // Insert at the start of the element
            element.insertBefore(marker, element.firstChild);
            return marker;
          }
        } catch (fallbackError) {
          // Final fallback: try to insert at the common ancestor
          try {
            const commonAncestor = clonedRange.commonAncestorContainer;
            if (commonAncestor.nodeType === Node.ELEMENT_NODE) {
              (commonAncestor as Element).insertBefore(marker, (commonAncestor as Element).firstChild);
              return marker;
            }
          } catch (finalError) {
            return null;
          }
        }
      }
    } catch (error) {
      return null;
    }
    return null;
  }, []);

  // Close tooltip when workspace changes
  const prevWorkspaceIdRef = useRef<string | null>(workspaceId);
  useEffect(() => {
    if (prevWorkspaceIdRef.current !== null && prevWorkspaceIdRef.current !== workspaceId) {
      // Workspace changed - close tooltip and exit modes
      setTooltipVisible(false);
      removeMarkerElement();
      exitMultiSelectMode();
      setMultiModeBasePosition(null);
      // Clear selection
      window.getSelection()?.removeAllRanges();
      setCurrentSelection(null);
      // Clear reply selections
      clearReplySelections();
    }
    prevWorkspaceIdRef.current = workspaceId;
  }, [workspaceId, setTooltipVisible, exitMultiSelectMode, removeMarkerElement, clearReplySelections]);

  // Close tooltip when thread changes
  const prevThreadIdRef = useRef<string | undefined>(currentThreadId);
  useEffect(() => {
    // Only trigger if thread actually changed (not on initial mount)
    if (prevThreadIdRef.current !== undefined && prevThreadIdRef.current !== currentThreadId) {
      // Thread changed - close tooltip and exit modes
      // Do this in a specific order to prevent DOM cleanup issues:
      // 1. Clear selection first (prevents Range from being detached while tooltip is cleaning up)
      window.getSelection()?.removeAllRanges();
      setCurrentSelection(null);
      // 2. Hide tooltip (this will trigger cleanup in HighlightTooltip)
      // Use requestAnimationFrame to ensure DOM updates complete first
      requestAnimationFrame(() => {
        setTooltipVisible(false);
        // 3. Remove marker element after tooltip cleanup has a chance to run
        setTimeout(() => {
          removeMarkerElement();
        }, 50);
      });
      // 4. Exit modes and clear state
      exitMultiSelectMode();
      setMultiModeBasePosition(null);
      // Clear reply selections
      clearReplySelections();
    }
    prevThreadIdRef.current = currentThreadId;
  }, [currentThreadId, setTooltipVisible, exitMultiSelectMode, removeMarkerElement, clearReplySelections]);

  // Track scroll activity (for preventing position updates during scroll in multi mode)
  // Note: Floating UI's autoUpdate handles position tracking automatically when referenceElement is provided
  useEffect(() => {
    const handleScroll = () => {
      isScrollingRef.current = true;

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      // Mark scrolling as finished after scroll stops
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 150); // Wait 150ms after scroll stops
    };

    // Listen to scroll on window and document
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Handle selection change from SelectableText component
  const handleSelectionChange = useCallback((selection: SelectionInfo | null) => {
    // Read the current mode state directly from the store to avoid stale closures
    const currentMultiMode = useUIStore.getState().inMultiSelectMode;

    if (selection) {
      // Update currentSelection - the Range will be passed directly to tooltip for tracking
      // Floating UI's autoUpdate will handle position updates automatically
      setCurrentSelection(selection);

      // Set initial position for tooltip (Floating UI will update it automatically)
      if (selection.position) {
        setTooltipPosition(selection.position);
      }

      setTooltipVisible(true);
    } else {
      // Selection cleared (null)
      setCurrentSelection(null);
      window.getSelection()?.removeAllRanges();

      if (currentMultiMode) {
        // In multi-mode: show multi-select options at base position
        if (multiModeBasePosition) {
          setTooltipPosition(multiModeBasePosition);
        } else {
          // Fallback to last known position if base position not set
          setTooltipPosition(lastTooltipPositionRef.current);
        }
        setTooltipVisible(true);
      } else {
        // Not in multi-mode: hide tooltip
        setTooltipVisible(false);
      }
    }
  }, [setTooltipVisible]);

  // Handle when a highlight is added
  const handleHighlightAdded = useCallback((highlight: TextHighlight) => {
    // Find the matching pending context by text
    const pendingIndex = pendingContexts.current.findIndex(p => p.text === highlight.text);
    if (pendingIndex !== -1) {
      const pending = pendingContexts.current[pendingIndex];
      // Store with the actual highlight ID
      highlightMessageContexts.current.set(highlight.id, pending.context);
      highlightUserPrompts.current.set(highlight.id, pending.userPrompt);
      // Remove from pending
      pendingContexts.current.splice(pendingIndex, 1);
    }

    // If in multi-mode, clear selection and show multi-select options
    const currentMultiMode = useUIStore.getState().inMultiSelectMode;

    if (currentMultiMode) {
      // Store highlight element in ref for immediate access (before highlights state updates)
      if (highlight.element) {
        lastHighlightElementRef.current = highlight.element;
      }

      // Clear selection now that highlight is added
      setCurrentSelection(null);
      window.getSelection()?.removeAllRanges();

      // Ensure tooltip is visible (multi-mode always shows tooltip)
      // Position is maintained from when "Select" was clicked via marker element tracking
      setTooltipVisible(true);
    }
  }, [setTooltipVisible, multiModeBasePosition, tooltipPosition]);

  // Handle when highlights change
  const handleHighlightsChange = useCallback((updatedHighlights: TextHighlight[]) => {
    // Update the ref with the last highlight element
    if (updatedHighlights.length > 0) {
      const lastHighlight = updatedHighlights[updatedHighlights.length - 1];
      if (lastHighlight?.element) {
        lastHighlightElementRef.current = lastHighlight.element;
      }
    } else {
      lastHighlightElementRef.current = null;
    }

    setHighlights(updatedHighlights);
  }, []);


  // Extract full message content from the DOM
  const extractMessageContext = useCallback((range: Range): string => {
    try {
      // Use the START of the range to find the message, not the common ancestor
      // This ensures we get the correct message even if selection spans multiple messages
      let element = range.startContainer;
      if (element.nodeType === Node.TEXT_NODE) {
        element = element.parentElement as Node;
      }

      // Look for the message content container (assistant-ui uses specific classes)
      const messageElement = (element as Element).closest('.aui-assistant-message-content, [data-message-id], .aui-message, [role="article"]');

      if (messageElement) {
        // Get the full text content of the message
        return messageElement.textContent?.trim() || "";
      }

      return "";
    } catch (error) {
      return "";
    }
  }, []);

  // Extract user prompt from the first "aui-user-message-content" div above the message
  const extractUserPrompt = useCallback((range: Range): string => {
    try {
      // Use the START of the range to find the message
      let element = range.startContainer;
      if (element.nodeType === Node.TEXT_NODE) {
        element = element.parentElement as Node;
      }

      // Look for the message content container
      const messageElement = (element as Element).closest('.aui-assistant-message-content, [data-message-id], .aui-message, [role="article"]');

      if (messageElement) {
        // Find all user message content elements
        const allUserMessages = document.querySelectorAll('.aui-user-message-content');

        // Find the last one that appears before the message element in document order
        let lastUserMessage: Element | null = null;
        for (const userMsg of Array.from(allUserMessages)) {
          if (messageElement.compareDocumentPosition(userMsg) & Node.DOCUMENT_POSITION_PRECEDING) {
            lastUserMessage = userMsg;
          }
        }

        if (lastUserMessage) {
          return lastUserMessage.textContent?.trim() || "";
        }
      }

      return "";
    } catch (error) {
      return "";
    }
  }, []);

  // Handle multi-select action (add highlight - works in both normal and multi mode)
  const handleMultiSelect = useCallback(() => {
    if (!currentSelection) return;

    // Save the selection position before clearing
    const selectionPosition = currentSelection.position;

    // Store current selection position as base position (where multi-select options will appear)
    setMultiModeBasePosition(selectionPosition);

    // Create marker element at the Range position for tracking
    // This must be done before the selection is cleared
    const markerElement = createMarkerElementAtRange(currentSelection.range);
    if (markerElement) {
      multiModeMarkerElementRef.current = markerElement;
      const markerRect = markerElement.getBoundingClientRect();

      // Calculate offset from marker position to mouse position
      // This offset will be used to position tooltip at mouse location while tracking marker
      const offset = {
        x: selectionPosition.x - markerRect.x,
        y: selectionPosition.y - markerRect.y,
      };
      markerToMouseOffsetRef.current = offset;
    } else {
      console.warn('[AssistantTextSelectionManager] Failed to create marker element');
      markerToMouseOffsetRef.current = null;
    }

    // Extract and store message context for this selection
    const messageContext = extractMessageContext(currentSelection.range);

    // Extract the user prompt
    const userPrompt = extractUserPrompt(currentSelection.range);

    // Store in pending contexts with the selection text for matching
    pendingContexts.current.push({
      text: currentSelection.text,
      context: messageContext,
      userPrompt: userPrompt,
    });

    // Enter multi mode - this is synchronous with Zustand!
    enterMultiSelectMode();

    // Trigger highlight addition - SelectableText will read selection from DOM
    // Don't clear selection here - handleHighlightAdded will clear it after highlight is added
    setTriggerAddHighlight(true);

    // Reset trigger after a brief delay
    setTimeout(() => {
      setTriggerAddHighlight(false);
    }, 100);

    // Note: Selection clearing will happen in handleHighlightAdded
    // after the highlight is successfully added

  }, [currentSelection, enterMultiSelectMode, extractMessageContext, extractUserPrompt, createMarkerElementAtRange]);

  // Handle reply action - adds selection to reply selections
  const handleReply = useCallback(() => {
    // If there's a current selection, add it first
    if (currentSelection) {
      // Extract and store message context for this selection
      const messageContext = extractMessageContext(currentSelection.range);

      // Extract the user prompt
      const userPrompt = extractUserPrompt(currentSelection.range);

      // Add to reply selections
      addReplySelection({
        text: currentSelection.text,
        messageContext,
        userPrompt,
      });
    }

    // If in multi-mode with existing highlights, add all current highlights to reply selections
    if (inMultiMode && highlights.length > 0) {
      highlights.forEach((highlight) => {
        const context = highlightMessageContexts.current.get(highlight.id);
        const prompt = highlightUserPrompts.current.get(highlight.id);
        addReplySelection({
          text: highlight.text,
          messageContext: context,
          userPrompt: prompt,
        });
      });
      // Clear highlights after adding to replies
      selectableTextRef.current?.clearAllHighlights();
      setHighlights([]);
      lastHighlightElementRef.current = null;
      removeMarkerElement();
      exitMultiSelectMode();
      setMultiModeBasePosition(null);
    }

    // If we had neither a current selection nor highlights, warn but don't fail silently
    if (!currentSelection && (!inMultiMode || highlights.length === 0)) {
      console.warn('[AssistantTextSelectionManager] handleReply - no selection or highlights to add');
      return;
    }

    // Clear selection and hide tooltip
    setCurrentSelection(null);
    window.getSelection()?.removeAllRanges();
    setTooltipVisible(false);

    // Focus the composer input after adding reply
    setTimeout(() => {
      const composerInput = document.querySelector('.aui-composer-input') as HTMLTextAreaElement | null;
      if (composerInput) {
        composerInput.focus();
      }
    }, 100);
  }, [currentSelection, inMultiMode, highlights, addReplySelection, extractMessageContext, extractUserPrompt, exitMultiSelectMode, setTooltipVisible, removeMarkerElement]);

  // Handle trash/negative feedback action - opens dialog
  const handleShitAction = useCallback(() => {
    if (!currentSelection) return;

    // Store the selected text before clearing
    setNegativeSelectionForDialog(currentSelection.text);

    // Extract and store the full message context
    const messageContext = extractMessageContext(currentSelection.range);
    setNegativeMessageContextForDialog(messageContext);

    // Extract and store the user prompt
    const userPrompt = extractUserPrompt(currentSelection.range);
    setNegativeUserPromptForDialog(userPrompt);

    // Hide tooltip
    setTooltipVisible(false);

    // Open negative feedback dialog
    setShowNegativeFeedbackDialog(true);
  }, [currentSelection, setTooltipVisible, extractMessageContext, extractUserPrompt]);

  // Handle submitting negative feedback
  const handleSubmitNegativeFeedback = useCallback(async () => {
    if (!negativeSelectionForDialog || !workspaceId) return;

    setIsSubmittingNegative(true);
    try {
      const response = await fetch("/api/add-negative-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selection: negativeSelectionForDialog,
          messageContext: negativeMessageContextForDialog,
          userPrompt: negativeUserPromptForDialog || undefined,
          annotation: negativeFeedbackAnnotation.trim() || undefined,
          workspaceId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save negative feedback");
      }

      const result = await response.json();
      toast.success(negativeFeedbackAnnotation.trim() ? "Feedback saved with notes!" : "Marked as not useful!");

      // Clear state
      setShowNegativeFeedbackDialog(false);
      setNegativeFeedbackAnnotation("");
      setNegativeSelectionForDialog("");
      setNegativeMessageContextForDialog("");
      setNegativeUserPromptForDialog("");
      window.getSelection()?.removeAllRanges();
      setCurrentSelection(null);
    } catch (error) {
      toast.error("Failed to save feedback");
    } finally {
      setIsSubmittingNegative(false);
    }
  }, [negativeSelectionForDialog, negativeMessageContextForDialog, negativeFeedbackAnnotation, workspaceId]);

  // Handle canceling negative feedback dialog
  const handleCancelNegativeFeedback = useCallback(() => {
    setShowNegativeFeedbackDialog(false);
    setNegativeFeedbackAnnotation("");
    setNegativeSelectionForDialog("");
    setNegativeMessageContextForDialog("");
    setNegativeUserPromptForDialog("");
    window.getSelection()?.removeAllRanges();
    setCurrentSelection(null);
  }, []);

  // Clear all highlights
  const clearAllHighlights = useCallback(() => {
    selectableTextRef.current?.clearAllHighlights();
    setHighlights([]);
    lastHighlightElementRef.current = null;
    // Remove marker element from DOM
    removeMarkerElement();
    exitMultiSelectMode();
    setMultiModeBasePosition(null);
    setCurrentSelection(null);
    setTooltipVisible(false);
    window.getSelection()?.removeAllRanges();
    // Clear message context storage
    highlightMessageContexts.current.clear();
    highlightUserPrompts.current.clear();
  }, [exitMultiSelectMode, setTooltipVisible, removeMarkerElement]);

  // Handle creating a note from current selection or highlights
  const handleCreateNote = useCallback(async () => {
    if (!workspaceId) {
      toast.error("No workspace selected");
      return;
    }

    // If there's a current selection and not in multi-mode, create note via agent
    if (currentSelection && !inMultiMode) {
      try {
        setIsProcessing(true);

        // Call the API endpoint that uses the workspace worker (same as createNote tool)
        const response = await fetch("/api/cards/from-message", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",

          },
          body: JSON.stringify({
            content: currentSelection.text,
            workspaceId,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to create note");
        }

        const result = await response.json();

        // Invalidate React Query cache to refresh the UI immediately
        if (workspaceId) {
          queryClient.invalidateQueries({
            queryKey: ["workspace", workspaceId, "events"],
          });
        }

        // Clear selection and hide tooltip
        setCurrentSelection(null);
        window.getSelection()?.removeAllRanges();
        setTooltipVisible(false);

        toast.success("Note created!");
      } catch (error) {
        console.error("Error creating note:", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to create note"
        );
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // If in multi-mode with highlights, open dialog
    if (inMultiMode && highlights.length > 0) {
      // Store the selections for the dialog with their message contexts and user prompts
      const selections = highlights.map(h => ({
        text: h.text,
        id: h.id,
        messageContext: highlightMessageContexts.current.get(h.id),
        userPrompt: highlightUserPrompts.current.get(h.id),
      }));

      setMultiSelectionsForDialog(selections);

      // Hide tooltip and exit multi mode
      setTooltipVisible(false);
      // Clean up marker element when exiting multi-mode
      removeMarkerElement();
      exitMultiSelectMode();

      // Open multi-select dialog
      setShowMultiSelectDialog(true);
      return;
    }

    // If no selection or highlights, show error
    toast.error("No content selected");
  }, [currentSelection, inMultiMode, highlights, workspaceId, queryClient, setTooltipVisible, exitMultiSelectMode, removeMarkerElement]);

  // Process all accumulated highlights - open dialog (kept for backwards compatibility)
  const processBatchHighlights = useCallback(async () => {
    await handleCreateNote();
  }, [handleCreateNote]);

  // Handle submitting multi selections - create note via agent
  const handleSubmitMultiSelections = useCallback(async () => {
    if (multiSelectionsForDialog.length === 0 || !workspaceId) return;

    const toastId = toast.loading("Creating note...");
    setShowMultiSelectDialog(false); // Close immediately for snappier UX
    setIsSubmittingMulti(true);
    try {
      // Combine all selections into a single content string
      // Format: each selection on a new line with optional annotation
      let combinedContent = multiSelectionsForDialog
        .map((s, index) => {
          let selectionText = s.text.trim();
          // Add selection number if multiple selections
          if (multiSelectionsForDialog.length > 1) {
            selectionText = `**Selection ${index + 1}:**\n${selectionText}`;
          }
          return selectionText;
        })
        .join("\n\n");

      // Add annotation if provided
      if (multiSelectAnnotation.trim()) {
        combinedContent = `${combinedContent}\n\n---\n\n**Notes:**\n${multiSelectAnnotation.trim()}`;
      }

      // Call the API endpoint that uses the workspace worker (same as createNote tool)
      const response = await fetch("/api/cards/from-message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",

        },
        body: JSON.stringify({
          content: combinedContent,
          workspaceId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create note");
      }

      const result = await response.json();

      // Invalidate React Query cache to refresh the UI immediately
      if (workspaceId) {
        queryClient.invalidateQueries({
          queryKey: ["workspace", workspaceId, "events"],
        });
      }

      toast.success(
        `Note created with ${multiSelectionsForDialog.length} selection${multiSelectionsForDialog.length > 1 ? 's' : ''}!`,
        { id: toastId }
      );

      // Clear state
      setMultiSelectionsForDialog([]);
      setMultiSelectAnnotation("");
      // clearAllHighlights already handles marker cleanup
      clearAllHighlights();
    } catch (error) {
      console.error("Error creating note:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create note"
        ,
        { id: toastId }
      );
    } finally {
      setIsSubmittingMulti(false);
    }
  }, [multiSelectionsForDialog, multiSelectAnnotation, workspaceId, queryClient, clearAllHighlights]);

  // Handle canceling multi-select dialog
  const handleCancelMultiDialog = useCallback(() => {
    setShowMultiSelectDialog(false);
    setMultiSelectionsForDialog([]);
    setMultiSelectAnnotation("");
    // clearAllHighlights already handles marker cleanup
    clearAllHighlights();
  }, [clearAllHighlights]);

  // Handle escape key
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      const currentMultiMode = useUIStore.getState().inMultiSelectMode;
      if (currentMultiMode) {
        // In multi-mode: clear selection but keep tooltip visible at base position
        setCurrentSelection(null);
        window.getSelection()?.removeAllRanges();
        if (multiModeBasePosition) {
          setTooltipPosition(multiModeBasePosition);
        }
        // Ensure tooltip is visible (multi-mode always shows tooltip)
        setTooltipVisible(true);
      } else {
        // Not in multi-mode: hide tooltip
        setTooltipVisible(false);
        setCurrentSelection(null);
        window.getSelection()?.removeAllRanges();
      }
    }
  }, [tooltipVisible, setTooltipVisible]);

  // Set up event listeners
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      // We intentionally access the current ref value here to clear any pending timeout
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timeout = selectionTimeoutRef.current;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [handleKeyDown]);

  // Cleanup marker element on component unmount
  useEffect(() => {
    return () => {
      removeMarkerElement();
    };
  }, [removeMarkerElement]);

  // Define tooltip actions - always show multi-mode actions when expanded
  const tooltipActions: TooltipAction[] = [
    // Multi-mode actions: Reply (add more), Note (create note), Clear all
    {
      id: "reply",
      label: "Reply",
      icon: <FaQuoteRight size={16} />,
      colorClass: "bg-blue-600 hover:bg-blue-700",
      onClick: handleReply,
    },
    {
      id: "note",
      label: "Note",
      icon: <FileText size={16} />,
      colorClass: "bg-green-600 hover:bg-green-700",
      onClick: handleCreateNote,
    },
    {
      id: "clear",
      label: "Clear",
      icon: <X size={16} />,
      colorClass: "bg-red-600 hover:bg-red-700",
      onClick: clearAllHighlights,
    },
  ];

  // Highlight action for collapsed state - always available
  // This acts like the "add" function - adds highlight and shows multi-mode options
  const highlightAction: TooltipAction = {
    id: "highlight",
    label: "Select",
    icon: <Highlighter size={16} />,
    colorClass: "bg-purple-600 hover:bg-purple-700",
    onClick: handleMultiSelect,
  };

  return (
    <>
      {/* SelectableText wrapper for the assistant-ui thread area */}
      <SelectableText
        ref={selectableTextRef}
        className={cn("fixed inset-0 pointer-events-none", className)}
        onSelectionChange={handleSelectionChange}
        onHighlightAdded={handleHighlightAdded}
        onHighlightsChange={handleHighlightsChange}
        highlights={highlights}
        containerSelector=".aui-thread-viewport"
        triggerAddHighlight={triggerAddHighlight}
        highlightClassName={getHighlightColorById(selectedHighlightColorId).className}
      >
        {null}
      </SelectableText>

      {/* Highlight Tooltip */}
      <HighlightTooltip
        visible={tooltipVisible}
        position={tooltipPosition}
        markerOffset={markerToMouseOffsetRef.current}
        referenceElement={(() => {
          // Priority:
          // 1. If there's an active selection, pass the Range but tooltip will use mouse position
          //    The tooltip will prioritize mouse position over Range for positioning
          // 2. If in multi-mode with no active selection, use the marker element created when "Select" was clicked
          //    Floating UI will automatically track it on scroll
          // 3. Otherwise, null (tooltip will use virtual element with position prop)

          let refElement: HTMLElement | Range | null = null;

          if (currentSelection?.range) {
            // Active selection: pass Range but tooltip will use mouse position for positioning
            // We still pass it so tooltip knows there's an active selection
            refElement = currentSelection.range;
          } else if (inMultiMode) {
            // Multi-mode with no active selection: use marker element created when "Select" was clicked
            // This marker element tracks the position where the select tooltip was
            refElement = multiModeMarkerElementRef.current;

            // Fallback to last highlight element if marker doesn't exist (for backwards compatibility)
            if (!refElement) {
              refElement = lastHighlightElementRef.current ||
                (highlights.length > 0 ? highlights[highlights.length - 1]?.element || null : null);
            }
          }

          return refElement;
        })()}
        actions={tooltipActions}
        onHide={() => {
          if (inMultiMode) {
            // In multi-mode: clear selection but keep tooltip visible at base position
            setCurrentSelection(null);
            window.getSelection()?.removeAllRanges();
            if (multiModeBasePosition) {
              setTooltipPosition(multiModeBasePosition);
            }
            // Ensure tooltip is visible (multi-mode always shows tooltip)
            setTooltipVisible(true);
          } else {
            // Not in multi-mode: hide tooltip
            setCurrentSelection(null);
            setTooltipVisible(false);
            window.getSelection()?.removeAllRanges();
          }
        }}
        badge={inMultiMode ? `${highlights.length} selected` : undefined}
        collapsed={!(inMultiMode && !currentSelection)} // Collapsed when not in multi-mode or has selection
        onExpand={() => { }}
        highlightAction={highlightAction}
      />

      {/* Multi-Select Dialog */}
      <Dialog open={showMultiSelectDialog} onOpenChange={(open) => {
        if (!open) {
          handleCancelMultiDialog();
        }
      }}>
        <DialogContent
          className="max-w-2xl border-white/20 bg-black/40 backdrop-blur-2xl shadow-2xl"
          style={{
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          <DialogHeader>
            <DialogTitle>Create a Note</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {multiSelectionsForDialog.map((selection, index) => (
              <div key={selection.id} className="space-y-2">
                {selection.messageContext && (
                  <Accordion type="single" collapsible className="w-full">
                    <AccordionItem value={`context-${index}`} className="border-0">
                      <div className="border rounded-md px-3">
                        <AccordionTrigger className="py-2 text-sm font-medium hover:no-underline">
                          View Full Message Context for Selection {index + 1}
                        </AccordionTrigger>
                        <AccordionContent>
                          <div className="rounded-md bg-muted p-3 text-sm max-h-64 overflow-y-auto mb-2">
                            <div className="text-muted-foreground text-xs whitespace-pre-wrap">{selection.messageContext}</div>
                          </div>
                        </AccordionContent>
                      </div>
                    </AccordionItem>
                  </Accordion>
                )}

                <div
                  className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-sm"
                >
                  <div className="font-medium mb-1 text-blue-900 dark:text-blue-100 text-xs">
                    Selection {index + 1}:
                  </div>
                  <div className="text-blue-800 dark:text-blue-200">{selection.text}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t">
            <Textarea
              placeholder="Add info about these selections (optional)..."
              value={multiSelectAnnotation}
              onChange={(e) => setMultiSelectAnnotation(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          <div className="pt-4 border-t space-y-3">

          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelMultiDialog}
              disabled={isSubmittingMulti}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitMultiSelections}
              disabled={isSubmittingMulti}
            >
              {isSubmittingMulti ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Negative Feedback Dialog */}
      <Dialog open={showNegativeFeedbackDialog} onOpenChange={setShowNegativeFeedbackDialog}>
        <DialogContent
          className="border-white/20 bg-black/40 backdrop-blur-2xl shadow-2xl"
          style={{
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          <DialogHeader>
            <DialogTitle>Report Unhelpful Content</DialogTitle>
            <DialogDescription>
              Help improve the AI by explaining what was wrong or unhelpful about this response.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {negativeUserPromptForDialog && (
              <div className="rounded-md bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 p-3 text-sm">
                <div className="font-medium mb-1 text-purple-900 dark:text-purple-100">User Prompt:</div>
                <div className="text-purple-800 dark:text-purple-200">{negativeUserPromptForDialog}</div>
              </div>
            )}

            {negativeMessageContextForDialog && (
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="context" className="border-0">
                  <div className="border rounded-md px-3">
                    <AccordionTrigger className="py-2 text-sm font-medium hover:no-underline">
                      View Full Message Context
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="rounded-md bg-muted p-3 text-sm max-h-64 overflow-y-auto mb-2">
                        <div className="text-muted-foreground text-xs whitespace-pre-wrap">{negativeMessageContextForDialog}</div>
                      </div>
                    </AccordionContent>
                  </div>
                </AccordionItem>
              </Accordion>
            )}

            <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-sm">
              <div className="font-medium mb-1 text-red-900 dark:text-red-100">Flagged Selection:</div>
              <div className="text-red-800 dark:text-red-200">{negativeSelectionForDialog}</div>
            </div>

            <div>
              <Textarea
                placeholder="What was wrong or unhelpful? (optional)..."
                value={negativeFeedbackAnnotation}
                onChange={(e) => setNegativeFeedbackAnnotation(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancelNegativeFeedback}
              disabled={isSubmittingNegative}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmitNegativeFeedback}
              disabled={isSubmittingNegative}
              variant="destructive"
            >
              {isSubmittingNegative ? "Saving..." : "Submit Feedback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
