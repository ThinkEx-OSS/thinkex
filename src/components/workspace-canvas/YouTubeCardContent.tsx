"use client";

import { useCallback, useEffect } from "react";
import type { Item, YouTubeData } from "@/lib/workspace-state/types";
import { extractYouTubeVideoId, getYouTubeThumbnailUrl, extractYouTubePlaylistId } from "@/lib/utils/youtube-url";
import { Play, List, Video } from "lucide-react";
import { useYouTubePlayer } from "@/hooks/use-youtube-player";
import { YouTubePlayerControls } from "./YouTubePlayerControls";

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
  // Check if this is a playlist
  const isPlaylist = playlistId !== null;

  const hasValidUrl = videoId !== null || playlistId !== null;

  // IFrame Player API hook – only active when the card is in "playing" mode
  // Native YouTube controls are hidden; our custom overlay replaces them
  const { containerRef, playerRef, isReady } = useYouTubePlayer({
    videoId: isPlaying ? videoId : null,
    playlistId: isPlaying ? playlistId : null,
    playerVars: {
      autoplay: 1,
      controls: 0,
      disablekb: 1,
      fs: 0,
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
      iframe.style.pointerEvents = "none";
      iframe.tabIndex = -1;
      iframe.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture");
      iframe.allowFullscreen = true;
    } catch {
      // Player may have been destroyed
    }
  }, [isReady, playerRef]);

  const handleAdjust = useCallback(() => {
    onTogglePlay(false);
  }, [onTogglePlay]);

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

  return (
    <div
      className="flex-1 min-h-0 relative"
      data-youtube-content
    >
      {isPlaying ? (
        <>
          {/* The YT.Player API replaces this div with its iframe */}
          <div ref={containerRef} className="w-full h-full" />
          {/* Custom controls overlay – replaces YouTube's native chrome */}
          <YouTubePlayerControls
            playerRef={playerRef}
            isReady={isReady}
            onAdjust={handleAdjust}
          />
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
                    <List className="h-3 w-3 text-foreground dark:text-white" />
                    <span className="text-xs font-medium text-foreground dark:text-white">Playlist</span>
                  </>
                ) : (
                  <>
                    <Video className="h-3 w-3 text-foreground dark:text-white" />
                    <span className="text-xs font-medium text-foreground dark:text-white">Video</span>
                  </>
                )}
              </div>
              {/* Play button */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-14 h-14 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg transition-all group-hover:scale-110">
                  <Play className="h-7 w-7 text-foreground fill-foreground ml-1 dark:text-white dark:fill-white" />
                </div>
              </div>
            </>
          ) : (
            // Fallback for playlists without thumbnails
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-red-500/10 to-red-600/10 rounded-lg border border-red-500/20">
              <div className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center shadow-lg transition-all group-hover:scale-110 mb-3">
                <Play className="h-8 w-8 text-foreground fill-foreground ml-1 dark:text-white dark:fill-white" />
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
