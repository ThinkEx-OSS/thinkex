"use client";

import { useCallback, useEffect } from "react";
import type { Item, YouTubeData } from "@/lib/workspace-state/types";
import { extractYouTubeVideoId, getYouTubeThumbnailUrl, extractYouTubePlaylistId } from "@/lib/utils/youtube-url";
import { Play } from "lucide-react";
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";


interface YouTubeCardContentProps {
  item: Item;
  isPlaying: boolean;
  onTogglePlay: (playing: boolean) => void;
}

export function YouTubeCardContent({ item, isPlaying, onTogglePlay }: YouTubeCardContentProps) {
  const youtubeData = item.data as YouTubeData;
  const videoId = extractYouTubeVideoId(youtubeData.url);
  const playlistId = extractYouTubePlaylistId(youtubeData.url);
  // Prioritize stored thumbnail (from oEmbed API) over calculated thumbnail
  const thumbnailUrl = youtubeData.thumbnail || getYouTubeThumbnailUrl(youtubeData.url);
  const hasValidUrl = videoId !== null || playlistId !== null;

  const { containerRef, playerRef, isReady } = useYouTubePlayer({
    videoId: isPlaying ? videoId : null,
    playlistId: isPlaying ? playlistId : null,
    playerVars: {
      autoplay: 0,
      controls: 1,
      disablekb: 0,
      fs: 1,
      iv_load_policy: 3,
      playsinline: 1,
      rel: 0,
    },
    onStateChange: useCallback((state: YT.PlayerState) => {
      if (state === YT.PlayerState.ENDED) {
        // Optionally handle video end
      }
    }, []),
  });

  // Style the iframe created by the YT.Player API once it's ready.
  // pointer-events:none + tabIndex=-1 ensure the iframe never captures
  // mouse or keyboard focus — our overlay handles all interaction.
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    try {
      const iframe = playerRef.current.getIframe();
      iframe.classList.add("w-full", "h-full", "rounded-lg");
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.borderRadius = "0.5rem";
      // pointer-events:none removed to allow interaction with native controls
      iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
      iframe.allowFullscreen = true;
    } catch {
      // Player may have been destroyed
    }
  }, [isReady, playerRef]);



  if (!hasValidUrl) {
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

  const title = item.name || "YouTube Video";

  return (
    <HoverCard openDelay={100} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div
          className="flex-1 min-h-0 relative group"
          data-youtube-content
        >
      {isPlaying ? (
        <>
          {/* The YT.Player API replaces this div with its iframe */}
          <div ref={containerRef} className="w-full h-full" />

          {/* Adjust Button Overlay - Visible on hover */}
          <div className="absolute top-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
            <div className="flex justify-start pointer-events-auto">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePlay(false);
                }}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-white/90 hover:text-white bg-black/50 hover:bg-black/70 backdrop-blur-md transition-colors shadow-sm"
              >
                Adjust
              </button>
            </div>
          </div>
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
      </HoverCardTrigger>
      <HoverCardContent side="top" className="max-w-[320px]">
        <p className="text-sm font-medium">{title}</p>
      </HoverCardContent>
    </HoverCard>
  );
}
export default YouTubeCardContent;
