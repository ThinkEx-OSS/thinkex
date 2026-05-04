"use client";

import { useEffect } from "react";
import type { Item, ItemData, YouTubeData } from "@/lib/workspace-state/types";
import {
  extractYouTubeVideoId,
  extractYouTubePlaylistId,
} from "@/lib/utils/youtube-url";
import { useYouTubePlayer } from "@/hooks/use-youtube-player";

interface YouTubePanelContentProps {
  item: Item;
  onUpdateItemData: (updater: (prev: ItemData) => ItemData) => void;
}

export function YouTubePanelContent({
  item,
  onUpdateItemData: _onUpdateItemData,
}: YouTubePanelContentProps) {
  const youtubeData = item.data as YouTubeData;
  const videoId = extractYouTubeVideoId(youtubeData.url);
  const playlistId = extractYouTubePlaylistId(youtubeData.url);

  const { containerRef, playerRef, isReady } = useYouTubePlayer({
    videoId: videoId ?? null,
    playlistId: playlistId ?? null,
    playerVars: {
      autoplay: 1,
      controls: 1,
      disablekb: 0,
      fs: 1,
      iv_load_policy: 3,
      playsinline: 1,
      rel: 0,
    },
  });

  // Style iframe once ready
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    try {
      const iframe = playerRef.current.getIframe();
      iframe.classList.add("w-full", "h-full", "rounded-lg");
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.borderRadius = "0.5rem";
      iframe.setAttribute(
        "allow",
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      );
      iframe.allowFullscreen = true;
    } catch {
      // Player may have been destroyed
    }
  }, [isReady, playerRef]);

  const hasValidUrl = videoId !== null || playlistId !== null;

  if (!hasValidUrl) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6">
        <div className="rounded-lg p-4 bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <span className="text-red-400 font-medium">Invalid YouTube URL</span>
        </div>
        <p className="text-xs text-muted-foreground/70 mt-2">
          Please check the URL and try again
        </p>
      </div>
    );
  }

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col rounded-lg overflow-hidden bg-black">
      {/* Min 200px per YouTube IFrame API; player fills available space */}
      <div ref={containerRef} className="w-full flex-1 min-h-[200px]" />
    </div>
  );
}
