"use client";

import { Streamdown, type CodeHighlighterPlugin } from "streamdown";
import "streamdown/styles.css";
import { createCodePlugin } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { createMathPlugin } from "@streamdown/math";
import { memo, useRef, type ReactNode, Children, isValidElement, type AnchorHTMLAttributes, type ClipboardEvent as ReactClipboardEvent, type HTMLAttributes } from "react";
import { InlineCitation, UrlCitation } from "@/components/ai-elements/inline-citation";
import { Badge } from "@/components/ui/badge";
import { MarkdownLink } from "@/components/ui/markdown-link";
import { useNavigateToItem } from "@/hooks/ui/use-navigate-to-item";
import { useWorkspaceState } from "@/hooks/workspace/use-workspace-state";
import { useUIStore } from "@/lib/stores/ui-store";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { getCitationUrl, preprocessLatex } from "@/lib/utils/preprocess-latex";
import { resolveItemByPath } from "@/lib/ai/tools/workspace-search-utils";
import { cn } from "@/lib/utils";

const math = createMathPlugin({ singleDollarTextMath: true });
const code = createCodePlugin({ themes: ["one-dark-pro", "one-dark-pro"] }) as CodeHighlighterPlugin;

function parseCitationPage(ref: string): { title: string; quote?: string; pageNumber?: number } {
  const segments = ref.split(/\s*\|\s*/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return { title: "" };
  const last = segments.at(-1) ?? "";
  const pageMatch = last.match(/^(?:p\.?\s*)?(\d+)$/i) || last.match(/^page\s*(\d+)$/i);
  let pageNumber: number | undefined;
  if (pageMatch) {
    pageNumber = Number.parseInt(pageMatch[1], 10);
    segments.pop();
  }
  return {
    title: segments[0] ?? "",
    quote: segments.length > 1 ? segments.slice(1).join(" | ") : undefined,
    pageNumber,
  };
}

function extractCitationText(children: ReactNode): string {
  if (typeof children === "string") return children.trim();
  if (children == null) return "";
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string") return child;
      if (isValidElement(child)) {
        const nested = (child.props as { children?: ReactNode }).children;
        return nested ? extractCitationText(nested) : "";
      }
      return "";
    })
    .join("")
    .trim();
}

const CitationRenderer = memo(({ children }: { children?: ReactNode }) => {
  const ref = extractCitationText(children);
  const url = getCitationUrl(ref);
  const workspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);
  const { state: workspaceState } = useWorkspaceState(workspaceId);
  const navigateToItem = useNavigateToItem();
  const openWorkspaceItem = useUIStore((state) => state.openWorkspaceItem);
  const setCitationHighlightQuery = useUIStore((state) => state.setCitationHighlightQuery);

  if (!ref) return null;
  if (url) return <UrlCitation url={url} />;
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    return <UrlCitation url={ref} />;
  }

  const { title, quote, pageNumber } = parseCitationPage(ref);
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\.pdf$/i, "");
  const item = resolveItemByPath(workspaceState, title) ?? workspaceState.find((candidate) =>
    (candidate.type === "document" || candidate.type === "pdf") && normalize(candidate.name) === normalize(title),
  );

  if (!item) {
    return <InlineCitation><Badge variant="secondary" className="ml-0.5 px-1.5 py-0 text-[10px]">{title}</Badge></InlineCitation>;
  }

  const displayTitle = title.includes("/") ? title.split("/").at(-1) ?? title : title;

  return (
    <InlineCitation>
      <Badge
        variant="secondary"
        className="ml-0.5 cursor-pointer px-1.5 py-0 text-[10px]"
        onClick={() => {
          if (quote?.trim() || (pageNumber != null && item.type === "pdf")) {
            setCitationHighlightQuery({ itemId: item.id, query: quote?.trim() ?? "", ...(pageNumber != null ? { pageNumber } : {}) });
          }
          navigateToItem(item.id, { silent: true });
          openWorkspaceItem(item.id);
        }}
      >
        {displayTitle.slice(0, 20)}{displayTitle.length > 20 ? "…" : ""}{pageNumber != null ? ` · p.${pageNumber}` : ""}
      </Badge>
    </InlineCitation>
  );
});
CitationRenderer.displayName = "CitationRenderer";

interface TextPartProps {
  text: string;
  isStreaming: boolean;
  threadId?: string | null;
  messageId: string;
  streamingVariant?: "default" | "reasoning";
}

function TextPartImpl({ text, isStreaming, threadId, messageId, streamingVariant = "default" }: TextPartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const components = {
    a: (props: AnchorHTMLAttributes<HTMLAnchorElement> & { node?: unknown }) => <MarkdownLink {...props} />,
    citation: ({ children: citationChildren }: { children?: ReactNode; [key: string]: unknown }) => <CitationRenderer>{citationChildren}</CitationRenderer>,
    ol: ({ children, ...props }: HTMLAttributes<HTMLOListElement>) => <ol className="ml-4 list-outside list-decimal whitespace-normal" {...props}>{children}</ol>,
    ul: ({ children, ...props }: HTMLAttributes<HTMLUListElement>) => <ul className="ml-4 list-outside list-disc whitespace-normal" {...props}>{children}</ul>,
  } as unknown as Parameters<typeof Streamdown>[0]["components"];

  const handleCopy = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const wrapper = document.createElement("div");
    wrapper.appendChild(selection.getRangeAt(0).cloneContents());
    wrapper.querySelectorAll<HTMLElement>("*").forEach((element) => {
      element.style.removeProperty("background");
      element.style.removeProperty("background-color");
    });
    const html = wrapper.innerHTML;
    const plainText = wrapper.textContent ?? "";
    if (!html && !plainText) return;
    event.preventDefault();
    if (html) event.clipboardData.setData("text/html", html);
    if (plainText) event.clipboardData.setData("text/plain", plainText);
  };

  return (
    <div key={`${threadId ?? "no-thread"}-${messageId}`} ref={containerRef} className="chat-v2-markdown" onCopy={handleCopy}>
      <Streamdown
        allowedTags={{ citation: [] }}
        animated={streamingVariant === "reasoning" ? { animation: "blurIn", duration: 250, easing: "ease-out" } : { animation: "fadeIn", duration: 200, easing: "ease-out" }}
        isAnimating={isStreaming}
        className={cn("streamdown-content size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0")}
        linkSafety={{ enabled: false }}
        plugins={{ code, mermaid, math }}
        components={components}
        mermaid={{ config: { theme: "dark" } }}
      >
        {preprocessLatex(text)}
      </Streamdown>
    </div>
  );
}

export const TextPart = memo(TextPartImpl);
