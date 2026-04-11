"use client";

import { Streamdown, type CodeHighlighterPlugin } from "streamdown";
import "streamdown/styles.css";
import { createCodePlugin } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { createMathPlugin } from "@streamdown/math";
import {
  useMessagePartText,
  type TextMessagePartProps,
} from "@assistant-ui/react";
import {
  Children,
  createContext,
  isValidElement,
  memo,
  useEffect,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type {
  AnchorHTMLAttributes,
  ClipboardEvent as ReactClipboardEvent,
  HTMLAttributes,
} from "react";
import {
  InlineCitation,
  UrlCitation,
} from "@/components/ai-elements/inline-citation";
import { useAssistantMessageContext } from "@/components/assistant-ui/thread";
import { Badge } from "@/components/ui/badge";
import { MarkdownLink } from "@/components/ui/markdown-link";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import type { Item } from "@/lib/workspace-state/types";
import { getCitationUrl } from "@/lib/utils/preprocess-latex";
import { resolveItemByPath } from "@/lib/ai/tools/workspace-search-utils";
import { preprocessLatex } from "@/lib/utils/preprocess-latex";
import { cn } from "@/lib/utils";

const math = createMathPlugin({ singleDollarTextMath: true });
const code = createCodePlugin({
  themes: ["one-dark-pro", "one-dark-pro"],
}) as CodeHighlighterPlugin;

/** Parse page number from citation ref (e.g. "Title | quote | p. 5" or "Title | p. 5"). */
function parseCitationPage(ref: string): {
  title: string;
  quote?: string;
  pageNumber?: number;
} {
  const segments = ref
    .split(/\s*\|\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) return { title: "" };

  const last = segments[segments.length - 1];
  const pageMatch =
    last.match(/^(?:p\.?\s*)?(\d+)$/i) || last.match(/^page\s*(\d+)$/i);
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

interface CitationContextType {
  workspaceState: Item[];
  navigateToItem: ReturnType<typeof useNavigateToItem>;
  openWorkspaceItem: (itemId: string | null) => void;
  setCitationHighlightQuery: (
    query: {
      itemId: string;
      query: string;
      pageNumber?: number;
    } | null,
  ) => void;
}

const CitationContext = createContext<CitationContextType | null>(null);

function CitationBadge({
  label,
  interactive = false,
  onClick,
}: {
  label: string;
  interactive?: boolean;
  onClick?: () => void;
}) {
  return (
    <InlineCitation>
      <Badge
        variant="secondary"
        className={cn(
          "ml-0.5 px-1.5 py-0 rounded-full text-[10px] font-medium",
          interactive && "cursor-pointer hover:bg-secondary/80",
        )}
        onClick={onClick}
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        onKeyDown={
          interactive && onClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick();
                }
              }
            : undefined
        }
      >
        {label}
      </Badge>
    </InlineCitation>
  );
}

function CitationContextProvider({ children }: { children: ReactNode }) {
  const workspaceId = useWorkspaceStore((s) => s.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const navigateToItem = useNavigateToItem();
  const openWorkspaceItem = useUIStore((s) => s.openWorkspaceItem);
  const setCitationHighlightQuery = useUIStore(
    (s) => s.setCitationHighlightQuery,
  );

  const value = useMemo(
    () => ({
      workspaceState,
      navigateToItem,
      openWorkspaceItem,
      setCitationHighlightQuery,
    }),
    [
      workspaceState,
      navigateToItem,
      openWorkspaceItem,
      setCitationHighlightQuery,
    ],
  );

  return (
    <CitationContext.Provider value={value}>
      {children}
    </CitationContext.Provider>
  );
}

/**
 * SurfSense-style citation renderer.
 * Content is the ref itself: urlciteN (URL), or Title, or Title|quote (workspace).
 */
const CitationRenderer = memo(({ children }: { children?: ReactNode }) => {
  const citationContext = useContext(CitationContext);
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

  const displayTitle = title.includes("/")
    ? (title.split("/").pop() ?? title)
    : title;
  const badgeLabel =
    displayTitle.slice(0, 20) +
    (displayTitle.length > 20 ? "…" : "") +
    (pageNumber != null ? ` · p.${pageNumber}` : "");

  if (!citationContext) {
    return <CitationBadge label={badgeLabel} />;
  }

  const {
    workspaceState,
    navigateToItem,
    openWorkspaceItem,
    setCitationHighlightQuery,
  } = citationContext;
  const titleNorm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/\.pdf$/i, "");

  const handleWorkspaceItemClick = () => {
    if (!title) return;
    const items = workspaceState;
    const byPath = resolveItemByPath(items, title);
    const item =
      byPath && (byPath.type === "document" || byPath.type === "pdf")
        ? byPath
        : items.find(
            (i) =>
              (i.type === "document" || i.type === "pdf") &&
              titleNorm(i.name) === titleNorm(title),
          );
    if (!item) return;
    if (quote?.trim() || (pageNumber != null && item.type === "pdf")) {
      setCitationHighlightQuery({
        itemId: item.id,
        query: quote?.trim() ?? "",
        ...(pageNumber != null && { pageNumber }),
      });
    }
    navigateToItem(item.id, { silent: true });
    openWorkspaceItem(item.id);
  };

  return (
    <CitationBadge
      label={badgeLabel}
      interactive
      onClick={handleWorkspaceItemClick}
    />
  );
});
CitationRenderer.displayName = "CitationRenderer";

/** Props from assistant-ui when used as Text component, or optional when used directly (e.g. in Reasoning) */
type MarkdownTextProps = Partial<TextMessagePartProps> & {
  /** Use "reasoning" for smoother streaming in reasoning blocks (blurIn, longer duration) */
  streamingVariant?: "default" | "reasoning";
};

const MarkdownTextImpl = (props: MarkdownTextProps) => {
  const streamingVariant = props.streamingVariant ?? "default";
  const { text } = useMessagePartText();
  const { isRunning } = useAssistantMessageContext();

  const animateConfig =
    streamingVariant === "reasoning"
      ? { animation: "blurIn" as const, duration: 250, easing: "ease-out" }
      : { animation: "fadeIn" as const, duration: 200, easing: "ease-out" };

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement;
      const preElement = target.closest("pre");

      if (!preElement) return;

      const isVerticalScroll = Math.abs(e.deltaY) > Math.abs(e.deltaX);

      if (isVerticalScroll) {
        const scrollParent = preElement.closest(
          ".aui-thread-viewport",
        ) as HTMLElement;
        if (scrollParent) {
          scrollParent.scrollTop += e.deltaY;
          e.preventDefault();
          e.stopPropagation();
        }
      }
    };

    container.addEventListener("wheel", handleWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      container.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, []);

  const handleCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    if (typeof window === "undefined") return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();

    const wrapper = document.createElement("div");
    wrapper.appendChild(fragment);

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
    <CitationContextProvider>
      <div ref={containerRef} className="aui-md" onCopy={handleCopy}>
        <Streamdown
          allowedTags={{ citation: [] }}
          animated={animateConfig}
          isAnimating={isRunning}
          className={cn(
            "streamdown-content size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
          )}
          linkSafety={{ enabled: false }}
          plugins={{ code, mermaid, math }}
          components={{
            a: (
              props: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: any },
            ) => <MarkdownLink {...props} />,
            citation: (props: any) => (
              <CitationRenderer>{props.children}</CitationRenderer>
            ),
            ol: ({
              children,
              node,
              ...props
            }: HTMLAttributes<HTMLOListElement> & { node?: any }) => (
              <ol
                className="ml-4 list-outside list-decimal whitespace-normal"
                {...props}
              >
                {children}
              </ol>
            ),
            ul: ({
              children,
              node,
              ...props
            }: HTMLAttributes<HTMLUListElement> & { node?: any }) => (
              <ul
                className="ml-4 list-outside list-disc whitespace-normal"
                {...props}
              >
                {children}
              </ul>
            ),
          }}
          mermaid={{
            config: {
              theme: "dark",
            },
          }}
        >
          {preprocessLatex(text)}
        </Streamdown>
      </div>
    </CitationContextProvider>
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
