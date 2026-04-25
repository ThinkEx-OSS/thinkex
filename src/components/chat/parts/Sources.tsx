"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const isSafeHttpUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const getDomainInitial = (url: string): string => {
  const domain = extractDomain(url);
  return domain.charAt(0).toUpperCase();
};

function SourceIcon({ url, className }: { url: string; className?: string }) {
  const [hasError, setHasError] = useState(false);
  const domain = extractDomain(url);
  if (hasError) {
    return (
      <span
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-muted font-medium text-[10px]",
          className,
        )}
      >
        {getDomainInitial(url)}
      </span>
    );
  }
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      className={cn("size-3.5 shrink-0 rounded-sm", className)}
      onError={() => setHasError(true)}
    />
  );
}

export interface SourceProps {
  url?: string;
  title?: string;
  sourceType?: "url" | "document";
}

export function Source({ url, title, sourceType }: SourceProps) {
  if (sourceType !== "url" || !url) return null;
  if (!isSafeHttpUrl(url)) return null;
  const domain = extractDomain(url);
  const displayTitle = title || domain;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border bg-transparent px-2 py-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <SourceIcon url={url} />
      <span className="max-w-37.5 truncate">{displayTitle}</span>
    </a>
  );
}
