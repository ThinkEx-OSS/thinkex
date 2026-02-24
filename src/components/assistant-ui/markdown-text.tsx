"use client";

import { Streamdown } from "streamdown";
import "streamdown/styles.css";
import { createCodePlugin } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { createMathPlugin } from "@streamdown/math";
import { useMessagePartText, useAuiState, type TextMessagePartProps } from "@assistant-ui/react";
import {
  Children,
  isValidElement,
  memo,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import type {
  AnchorHTMLAttributes,
  ClipboardEvent as ReactClipboardEvent,
  HTMLAttributes,
} from "react";
import { InlineCitation, UrlCitation } from "@/components/ai-elements/inline-citation";
import { Badge } from "@/components/ui/badge";
import { MarkdownLink } from "@/components/ui/markdown-link";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { getCitationUrl } from "@/lib/utils/preprocess-latex";
import { resolveItemByPath } from "@/lib/ai/tools/workspace-search-utils";
import { preprocessLatex } from "@/lib/utils/preprocess-latex";
import { cn } from "@/lib/utils";

const math = createMathPlugin({ singleDollarTextMath: true });
const code = createCodePlugin({ themes: ["one-dark-pro", "one-dark-pro"] });

/** Parse page number from citation ref (e.g. "Title | quote | p. 5" or "Title | p. 5"). */
function parseCitationPage(ref: string): { title: string; quote?: string; pageNumber?: number } {
  const segments = ref.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return { title: "" };

  const last = segments[segments.length - 1];
  const pageMatch = last.match(/^(?:p\.?\s*)?(\d+)$/i) || last.match(/^page\s*(\d+)$/i);
  let pageNumber: number | undefined;
  let title: string;
  let quote: string | undefined;

  if (pageMatch) {
    pageNumber = parseInt(pageMatch[1], 10);
    segments.pop();
  }
  title = segments[0] ?? "";
  quote = segments.length > 1 ? segments.slice(1).join(" | ") : undefined;
  return { title, quote: quote || undefined, pageNumber };
}

/** Extract raw text from citation element children (handles nested elements). */
function extractCitationText(children: ReactNode): string {
  if (typeof children === "string") return children.trim();
  if (children == null) return "";
  const arr = Children.toArray(children);
  return arr
    .map((child) => {
      if (typeof child === "string") return child;
      if (isValidElement(child)) {
        const nested = (child.props as { children?: ReactNode }).children;
        if (nested != null) return extractCitationText(nested);
      }
      return "";
    })
    .join("")
    .trim();
}

/**
 * SurfSense-style citation renderer.
 * Content is the ref itself: urlciteN (URL), or Title, or Title|quote (workspace).
 */
const CitationRenderer = memo(
  ({ children }: { children?: ReactNode }) => {
    const ref = extractCitationText(children);
    if (!ref) return null;

    // URL placeholder (from preprocess): render as direct link
    const url = getCitationUrl(ref);
    if (url) {
      return <UrlCitation url={url} />;
    }

    // Direct URL (in case preprocess didn't run, e.g. edge case)
    if (ref.startsWith("http://") || ref.startsWith("https://")) {
      return <UrlCitation url={ref} />;
    }

    // Workspace citation: Title, Title|quote, or Title|quote|p. 5 (with optional page)
    const parsed = parseCitationPage(ref);
    const { title: parsedTitle, quote: parsedQuote, pageNumber } = parsed;
    const title = parsedTitle;
    const quote = parsedQuote;

    const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
    const { state: workspaceState } = useWorkspaceState(workspaceId);
    const navigateToItem = useNavigateToItem();
    const setOpenModalItemId = useUIStore((s) => s.setOpenModalItemId);
    // Normalize for matching: trim, lowercase, strip .pdf (model may include it; items often don't)
    const titleNorm = (s: string) => s.trim().toLowerCase().replace(/\.pdf$/i, "");
    const setCitationHighlightQuery = useUIStore((s) => s.setCitationHighlightQuery);

    const handleWorkspaceItemClick = () => {
      if (!workspaceState?.items || !title) return;
      // Resolve by virtual path first (e.g. "pdfs/Syllabus.pdf") — AI may cite using paths from <virtual-workspace>
      const items = workspaceState.items;
      const byPath = resolveItemByPath(items, title);
      const item =
        byPath && (byPath.type === "note" || byPath.type === "pdf")
          ? byPath
          : items.find(
              (i) =>
                (i.type === "note" || i.type === "pdf") &&
                titleNorm(i.name) === titleNorm(title)
            );
      if (!item) return;
      // Set citation highlight: for PDFs with page, or when we have a quote to search
      if (quote?.trim() || (pageNumber != null && item.type === "pdf")) {
        setCitationHighlightQuery({
          itemId: item.id,
          query: quote?.trim() ?? "",
          ...(pageNumber != null && { pageNumber }),
        });
      }
      navigateToItem(item.id, { silent: true });
      setOpenModalItemId(item.id);
    };

    // For path-like refs (e.g. pdfs/Syllabus.pdf), show basename in badge
    const displayTitle = title.includes("/") ? title.split("/").pop() ?? title : title;
    const badgeLabel =
      displayTitle.slice(0, 20) + (displayTitle.length > 20 ? "…" : "") +
      (pageNumber != null ? ` · p.${pageNumber}` : "");

    return (
      <InlineCitation>
        <Badge
          variant="secondary"
          className="ml-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium cursor-pointer hover:bg-secondary/80"
          onClick={handleWorkspaceItemClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              handleWorkspaceItemClick();
            }
          }}
        >
          {badgeLabel}
        </Badge>
      </InlineCitation>
    );
  }
);
CitationRenderer.displayName = "CitationRenderer";

/** Props from assistant-ui when used as Text component, or optional when used directly (e.g. in Reasoning) */
type MarkdownTextProps = Partial<TextMessagePartProps> & {
  /** Use "reasoning" for smoother streaming in reasoning blocks (blurIn, longer duration) */
  streamingVariant?: "default" | "reasoning";
};

const MarkdownTextImpl = (props: MarkdownTextProps) => {
  const streamingVariant = props.streamingVariant ?? "default";
  // Get the text content from assistant-ui context
  const { text } = useMessagePartText();

  // Get thread and message ID for unique key per message
  const threadId = useAuiState(({ threads }) => (threads as any)?.mainThreadId);
  const messageId = useAuiState(({ message }) => (message as any)?.id);

  // Check if the message is currently streaming
  const isRunning = useAuiState(({ thread }) => (thread as any)?.isRunning ?? false);

  const animateConfig =
    streamingVariant === "reasoning"
      ? { animation: "blurIn" as const, duration: 250, easing: "ease-out" }
      : { animation: "fadeIn" as const, duration: 200, easing: "ease-out" };

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
      <Streamdown
        allowedTags={{ citation: [] }}
        animated={animateConfig}
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
    </div>
  );
};


export const MarkdownText = memo(MarkdownTextImpl);
