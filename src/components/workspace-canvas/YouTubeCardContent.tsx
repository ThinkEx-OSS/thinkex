"use client";

import type { Item, YouTubeData } from "@/lib/workspace-state/types";
import {
  extractYouTubeVideoId,
  getYouTubeThumbnailUrl,
  extractYouTubePlaylistId,
} from "@/lib/utils/youtube-url";
import { Play } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

interface YouTubeCardContentProps {
  item: Item;
}

/** Thumbnail preview on the canvas; playback happens in the YouTube panel. */
export function YouTubeCardContent({ item }: YouTubeCardContentProps) {
  const youtubeData = item.data as YouTubeData;
  const videoId = extractYouTubeVideoId(youtubeData.url);
  const playlistId = extractYouTubePlaylistId(youtubeData.url);
  const thumbnailUrl = youtubeData.thumbnail || getYouTubeThumbnailUrl(youtubeData.url);
  const hasValidUrl = videoId !== null || playlistId !== null;

  if (!hasValidUrl) {
    return (
      <div className="p-1 min-h-0">
        <div className="flex flex-col items-center justify-center gap-3 text-center h-full">
          <div className="rounded-lg p-4 bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <span className="text-red-400 font-medium">Invalid YouTube URL</span>
          </div>
          <p className="text-xs text-muted-foreground/70">
            Please check the URL and try again
          </p>
        </div>
      </div>
    );
  }

  const title = item.name || "YouTube Video";

  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="flex-1 min-h-0 relative group" data-youtube-content>
          <div className="relative w-full h-full cursor-pointer group">
            {thumbnailUrl ? (
              <>
                <img
                  src={thumbnailUrl}
                  alt={item.name || "YouTube Video"}
                  className="w-full h-full object-cover rounded-lg"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors rounded-lg" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg transition-all group-hover:scale-110">
                    <Play className="h-7 w-7 text-white fill-white ml-1" />
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-500/10 to-red-600/10 rounded-lg border border-red-500/20">
                <div className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg transition-all group-hover:scale-110 mb-3">
                  <Play className="h-8 w-8 text-white fill-white ml-1" />
                </div>
                <p className="text-sm font-medium text-foreground">YouTube Playlist</p>
                <p className="text-xs text-muted-foreground mt-1">Click to play</p>
              </div>
            )}
          </div>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="top" className="max-w-[320px]">
        <p className="text-sm font-medium">{title}</p>
      </HoverCardContent>
    </HoverCard>
  );
}

export default YouTubeCardContent;
