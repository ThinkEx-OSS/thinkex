"use client";

import type { ComponentProps } from "react";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

export type InlineCitationProps = ComponentProps<"span">;

/**
 * Wrapper span rendered around inline citations inside assistant markdown.
 * Only the container + `UrlCitation` below are used today; the richer
 * popover variants from the original AI Elements reference were trimmed.
 */
export const InlineCitation = ({ className, ...props }: InlineCitationProps) => (
  <span
    className={cn(
      "group inline-flex items-baseline gap-0.5 text-[0.7em]",
      className,
    )}
    {...props}
  />
);

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Clickable badge with domain, opens in a new tab. Used for
 * `[citation:https://...]` refs.
 */
export function UrlCitation({ url }: { url: string }) {
  const domain = extractDomain(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-0.5 align-super ml-0.5 rounded-full bg-secondary px-1.5 py-0 text-[10px] font-bold text-secondary-foreground no-underline transition-colors hover:bg-secondary/80"
      title={url}
    >
      <ExternalLink className="size-2.5 shrink-0" />
      {domain}
    </a>
  );
}
