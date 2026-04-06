"use client";

import type { Item, WebsiteData } from "@/lib/workspace-state/types";

interface WebsitePanelContentProps {
  item: Item;
}

export function WebsitePanelContent({
  item,
}: WebsitePanelContentProps) {
  const websiteData = item.data as WebsiteData;

  if (!websiteData.url) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6">
        <div className="rounded-lg p-4 bg-muted/50 border border-border flex items-center justify-center">
          <span className="text-muted-foreground font-medium">No URL provided</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col overflow-hidden bg-white">
      <iframe
        src={websiteData.url}
        title={item.name || "Website"}
        className="w-full flex-1 min-h-0 border-0"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        allow="clipboard-write"
        referrerPolicy="no-referrer"
      />
    </div>
  );
}
