"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Item, ItemData, YouTubeData } from "@/lib/workspace-state/types";
import {
  extractYouTubeVideoId,
  extractYouTubePlaylistId,
} from "@/lib/utils/youtube-url";
import {
  getYouTubeProgressKey,
  getYouTubeProgress,
  setYouTubeProgress,
} from "@/lib/youtube-progress";
import { useYouTubePlayer } from "@/hooks/use-youtube-player";

const PROGRESS_SAVE_INTERVAL_MS = 10000; // Save every 10s while playing

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
  const progressKey = getYouTubeProgressKey(videoId, playlistId);
  const stored = getYouTubeProgress(progressKey);
  const startSeconds = stored?.progress ?? 0;
  const savedPlaybackRate = stored?.playbackRate;

  const saveStateRef = useRef<
    (opts: { seconds: number; playbackRate?: number }) => void
  >(undefined);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const saveState = useCallback(
    (opts: { seconds: number; playbackRate?: number }) => {
      setYouTubeProgress(progressKey, opts.seconds, opts.playbackRate);
    },
    [progressKey]
  );

  saveStateRef.current = saveState;

  const { containerRef, playerRef, isReady } = useYouTubePlayer({
    videoId: videoId ?? null,
    playlistId: playlistId ?? null,
    startSeconds: startSeconds > 0 ? startSeconds : undefined,
    playerVars: {
      autoplay: 1,
      controls: 1,
      disablekb: 0,
      fs: 1,
      iv_load_policy: 3,
      playsinline: 1,
      rel: 0,
    },
    onStateChange: useCallback((state: YT.PlayerState) => {
      const player = playerRef.current;
      if (!player) return;

      // Clear any existing interval
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }

      if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.ENDED) {
        try {
          saveStateRef.current?.({
            seconds: player.getCurrentTime(),
            playbackRate: player.getPlaybackRate?.(),
          });
        } catch {
          // Player may be destroyed
        }
      } else if (state === YT.PlayerState.PLAYING) {
        // Save progress periodically while playing
        progressIntervalRef.current = setInterval(() => {
          try {
            const currentPlayer = playerRef.current;
            if (currentPlayer?.getPlayerState?.() === YT.PlayerState.PLAYING) {
              saveStateRef.current?.({
                seconds: currentPlayer.getCurrentTime(),
                playbackRate: currentPlayer.getPlaybackRate?.(),
              });
            }
          } catch {
            // Player may be destroyed
          }
        }, PROGRESS_SAVE_INTERVAL_MS);
      }
    }, []),
  });

  // Apply saved playback rate and style iframe once ready
  useEffect(() => {
    if (!isReady || !playerRef.current) return;
    try {
      const player = playerRef.current;
      if (
        savedPlaybackRate != null &&
        savedPlaybackRate > 0 &&
        savedPlaybackRate !== 1 &&
        player.setPlaybackRate
      ) {
        const rates = player.getAvailablePlaybackRates?.() ?? [];
        const valid = rates.includes(savedPlaybackRate)
          ? savedPlaybackRate
          : [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].includes(savedPlaybackRate)
            ? savedPlaybackRate
            : 1;
        player.setPlaybackRate(valid);
      }
      const iframe = player.getIframe();
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

  // Cleanup interval and save final state on unmount (e.g. when closing split view)
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      try {
        const player = playerRef.current;
        if (player?.getCurrentTime != null) {
          saveStateRef.current?.({
            seconds: player.getCurrentTime(),
            playbackRate: player.getPlaybackRate?.(),
          });
        }
      } catch {
        // Player may already be destroyed
      }
    };
  }, []);

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
