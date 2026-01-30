"use client";

import { useState } from "react";
import type { Item, YouTubeData } from "@/lib/workspace-state/types";
import { getYouTubeEmbedUrl, getYouTubeThumbnailUrl, extractYouTubePlaylistId } from "@/lib/utils/youtube-url";
import { Play, Move, List, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

interface YouTubeCardContentProps {
  item: Item;
  isPlaying: boolean;
  onTogglePlay: (playing: boolean) => void;
}

export function YouTubeCardContent({ item, isPlaying, onTogglePlay }: YouTubeCardContentProps) {
  const [isHovering, setIsHovering] = useState(false);

  const youtubeData = item.data as YouTubeData;
  const embedUrl = getYouTubeEmbedUrl(youtubeData.url);
  // Prioritize stored thumbnail (from oEmbed API) over calculated thumbnail
  const thumbnailUrl = youtubeData.thumbnail || getYouTubeThumbnailUrl(youtubeData.url);
  // Check if this is a playlist
  const isPlaylist = extractYouTubePlaylistId(youtubeData.url) !== null;

  if (!embedUrl) {
    // Invalid URL - show error state
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

  // No internal click handlers anymore - parent handles it via bubbling or direct prop passing
  // but we provide helper for the Adjust button since it's an explicit action
  const handleAdjustClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTogglePlay(false);
  };

  return (
    <div
      className="flex-1 min-h-0 relative"
      data-youtube-content
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {isPlaying ? (
        <>
          <div className="w-full h-full">
            <iframe
              src={embedUrl}
              title={item.name || "YouTube Video"}
              className="w-full h-full rounded-lg"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
          {/* Adjust button on hover */}
          {isHovering && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAdjustClick}
              className="absolute top-2 left-1/2 -translate-x-1/2 z-10 gap-1.5 bg-white/90 hover:bg-white text-black border border-gray-200 backdrop-blur-sm shadow-sm"
            >
              <Move className="h-3.5 w-3.5" />
              <span className="text-xs">Adjust</span>
            </Button>
          )}
        </>
      ) : (
        // Thumbnail view with play button (or playlist fallback)
        <div
          className="relative w-full h-full cursor-pointer group"
        // onClick is handled by parent WorkspaceCard
        >
          {thumbnailUrl ? (
            <>
              <img
                src={thumbnailUrl}
                alt={item.name || "YouTube Video"}
                className="w-full h-full object-cover rounded-lg"
              />
              {/* Dark overlay */}
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors rounded-lg" />
              {/* Type badge in bottom-right corner */}
              <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/80 backdrop-blur-sm">
                {isPlaylist ? (
                  <>
                    <List className="h-3 w-3 text-white" />
                    <span className="text-xs font-medium text-white">Playlist</span>
                  </>
                ) : (
                  <>
                    <Video className="h-3 w-3 text-white" />
                    <span className="text-xs font-medium text-white">Video</span>
                  </>
                )}
              </div>
              {/* Play button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg transition-all group-hover:scale-110">
                  <Play className="h-7 w-7 text-white fill-white ml-1" />
                </div>
              </div>
            </>
          ) : (
            // Fallback for playlists without thumbnails
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-500/10 to-red-600/10 rounded-lg border border-red-500/20">
              <div className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg transition-all group-hover:scale-110 mb-3">
                <Play className="h-8 w-8 text-white fill-white ml-1" />
              </div>
              <p className="text-sm font-medium text-foreground">YouTube Playlist</p>
              <p className="text-xs text-muted-foreground mt-1">Click to play</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default YouTubeCardContent;
