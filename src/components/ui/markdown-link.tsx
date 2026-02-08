"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ExternalLink } from "lucide-react";

const extractDomain = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const getDomainInitial = (url: string): string => {
  const domain = extractDomain(url);
  return domain.charAt(0).toUpperCase();
};

function LinkFavicon({ url, className }: { url: string; className?: string }) {
  const [hasError, setHasError] = useState(false);
  const domain = extractDomain(url);

  if (hasError) {
    return (
      <span
        className={cn(
          "inline-flex size-3.5 shrink-0 items-center justify-center rounded-sm bg-muted font-medium text-[10px]",
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

export function MarkdownLink({
  href,
  children,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const url = href || "";
  const isExternal =
    url.startsWith("http://") || url.startsWith("https://");

  if (!isExternal) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-md border bg-transparent px-1.5 py-0.5 text-xs font-medium text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground",
      )}
      {...props}
    >
      <LinkFavicon url={url} />
      <span className="max-w-48 truncate">{children}</span>
      <ExternalLink className="size-3 shrink-0 opacity-50" />
    </a>
  );
}
