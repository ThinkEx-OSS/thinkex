"use client";

import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { createCodePlugin } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { createMathPlugin } from "@streamdown/math";
import { useMessagePartText, useAuiState } from "@assistant-ui/react";
import {
  Children,
  createContext,
  isValidElement,
  memo,
  useRef,
  useEffect,
  useContext,
  type ReactNode,
} from "react";
import type {
  AnchorHTMLAttributes,
  ClipboardEvent as ReactClipboardEvent,
  HTMLAttributes,
} from "react";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardTrigger,
  InlineCitationCardBody,
  InlineCitationSource,
  InlineCitationQuote,
} from "@/components/ai-elements/inline-citation";
import { MarkdownLink } from "@/components/ui/markdown-link";
import { useCitationsFromMessage } from "@/hooks/ai/use-citations-from-message";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import type { Citation } from "@/lib/ai/citations/types";
import { preprocessLatex } from "@/lib/utils/preprocess-latex";
import { cn } from "@/lib/utils";

const math = createMathPlugin({ singleDollarTextMath: true });
const code = createCodePlugin({ themes: ["one-dark-pro", "one-dark-pro"] });
const CitationContext = createContext<Citation[]>([]);

/** Recursively extract all text from children (handles nested elements from markdown parsing). */
function extractAllText(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (children == null) return "";
  const arr = Children.toArray(children);
  return arr
    .map((child) => {
      if (typeof child === "string") return child;
      if (isValidElement(child)) {
        const nested = (child.props as { children?: ReactNode }).children;
        if (nested != null) return extractAllText(nested);
      }
      return "";
    })
    .join("");
}

/** Parse "N | quote" or legacy "N" from citation element content. */
function parseCitationContent(children: ReactNode): { number: string; quote?: string } {
  const text = extractAllText(children).trim();
  if (!text) return { number: "1" };
  // New format: "N | quote" — same source can have different quotes per use
  const pipeIdx = text.indexOf(" | ");
  if (pipeIdx !== -1) {
    return {
      number: text.slice(0, pipeIdx).trim() || "1",
      quote: text.slice(pipeIdx + 3).trim() || undefined,
    };
  }
  // Legacy: just "N"
  return { number: text };
}

const CitationRenderer = memo(
  ({ children }: { children?: ReactNode }) => {
    const citations = useContext(CitationContext);
    const { number: idStr, quote: instanceQuote } = parseCitationContent(children);
    const index = parseInt(idStr, 10);
    const citation = !isNaN(index) && index >= 1 ? citations[index - 1] : null;
    // Prefer instance-level quote (new format); fall back to source quote (legacy)
    const quote = instanceQuote ?? citation?.quote;
    const effectiveCitation = citation ?? {
      number: idStr,
      title: `Source ${idStr}`,
    };

    const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);
    const navigateToItem = useNavigateToItem();
    const setOpenModalItemId = useUIStore((s) => s.setOpenModalItemId);

    const titleNorm = (s: string) => s.trim().toLowerCase();
    const setCitationHighlightQuery = useUIStore((s) => s.setCitationHighlightQuery);
    const handleWorkspaceItemClick = () => {
      if (!workspaceState?.items || !effectiveCitation.title) return;
      const item = workspaceState.items.find(
        (i) =>
          (i.type === "note" || i.type === "pdf") &&
          titleNorm(i.name) === titleNorm(effectiveCitation.title)
      );
      if (!item) return;
      // Set highlight query first (works when item is already open)
      if (quote?.trim()) {
        setCitationHighlightQuery({ itemId: item.id, query: quote.trim() });
      }
      navigateToItem(item.id, { silent: true });
      setOpenModalItemId(item.id);
    };

    const hasWorkspaceItem =
      !effectiveCitation.url &&
      workspaceState?.items?.some(
        (i) =>
          (i.type === "note" || i.type === "pdf") &&
          titleNorm(i.name) === titleNorm(effectiveCitation.title)
      );

    return (
      <InlineCitation>
        <InlineCitationCard>
          <InlineCitationCardTrigger
            sources={effectiveCitation.url ? [effectiveCitation.url] : []}
            fallbackLabel={idStr}
          />
          <InlineCitationCardBody>
            <InlineCitationSource
              className="block p-2.5"
              title={effectiveCitation.title}
              url={effectiveCitation.url}
              onClick={
                hasWorkspaceItem ? handleWorkspaceItemClick : undefined
              }
            >
              {quote && <InlineCitationQuote>{quote}</InlineCitationQuote>}
            </InlineCitationSource>
          </InlineCitationCardBody>
        </InlineCitationCard>
      </InlineCitation>
    );
  }
);
CitationRenderer.displayName = "CitationRenderer";

const MarkdownTextImpl = () => {
  // Get the text content from assistant-ui context
  const { text } = useMessagePartText();
  const citations = useCitationsFromMessage();

  // Get thread and message ID for unique key per message
  const threadId = useAuiState(({ threads }) => (threads as any)?.mainThreadId);
  const messageId = useAuiState(({ message }) => (message as any)?.id);

  // Check if the message is currently streaming
  const isRunning = useAuiState(({ thread }) => (thread as any)?.isRunning ?? false);

  const containerRef = useRef<HTMLDivElement>(null);

  // Combine thread and message ID for unique key per message
  const key = `${threadId || 'no-thread'}-${messageId || 'no-message'}`;

  // Set up wheel event handlers for all code blocks to prevent vertical scroll trapping
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      const preElement = target.closest('pre');

      if (!preElement) return;

      // If user is primarily scrolling vertically (more vertical than horizontal movement)
      const isVerticalScroll = Math.abs(e.deltaY) > Math.abs(e.deltaX);

      if (isVerticalScroll) {
        // Always let vertical scroll bubble up to parent - don't let code block trap it
        const scrollParent = preElement.closest('.aui-thread-viewport') as HTMLElement;
        if (scrollParent) {
          scrollParent.scrollTop += e.deltaY;
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false, capture: true });

    return () => {
      container.removeEventListener('wheel', handleWheel, { capture: true });
    };
  }, [threadId, messageId]);

  // Ensure copied content keeps rich HTML but strips background/highlight styles
  const handleCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (typeof window === "undefined") return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();

    // Wrap in a temporary container so we can serialize + sanitize
    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);

    // Strip background/highlight styles from copied HTML
    wrapper.querySelectorAll<HTMLElement>("*").forEach((el) => {
      el.style?.removeProperty("background");
      el.style?.removeProperty("background-color");
    });

    const html = wrapper.innerHTML;
    const plainText = wrapper.textContent ?? "";

    if (!html && !plainText) return;

    event.preventDefault();
    if (html) {
      event.clipboardData.setData("text/html", html);
    }
    if (plainText) {
      event.clipboardData.setData("text/plain", plainText);
    }
  };

  return (
    <div key={key} ref={containerRef} className="aui-md" onCopy={handleCopy}>
      <CitationContext.Provider value={citations}>
      <Streamdown
        allowedTags={{ citation: [] }}
        animated={{ animation: "fadeIn", duration: 200, easing: "ease-out" }}
        isAnimating={isRunning}
        caret="block"
        className={cn(
          "streamdown-content size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        )}
        linkSafety={{ enabled: false }}
        plugins={{ code, mermaid, math }}
        components={{
          a: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: any }) => (
            <MarkdownLink {...props} />
          ),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          citation: (props: any) => (
            <CitationRenderer>{props.children}</CitationRenderer>
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
        {preprocessLatex(text)}
      </Streamdown>
      </CitationContext.Provider>
    </div>
  );
};


export const MarkdownText = memo(MarkdownTextImpl);
