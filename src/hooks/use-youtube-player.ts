"use client";

import { useEffect, useRef, useCallback, useState } from "react";

/**
 * Singleton: ensures the YouTube IFrame API script is loaded exactly once.
 * Resolves when `window.YT` is ready.
 */
let apiPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve) => {
    // Already loaded
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    // The API calls this global callback when ready
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    const firstScript = document.getElementsByTagName("script")[0];
    firstScript?.parentNode?.insertBefore(tag, firstScript);
  });

  return apiPromise;
}

interface UseYouTubePlayerOptions {
  videoId: string | null;
  playlistId?: string | null;
  /** Called when the player fires a state-change event */
  onStateChange?: (state: YT.PlayerState) => void;
  /** Called when the player is ready */
  onReady?: (player: YT.Player) => void;
  /** Called on player error */
  onError?: (errorCode: number) => void;
  /** Extra playerVars passed to the constructor */
  playerVars?: YT.PlayerVars;
}

/**
 * React hook that manages a single YT.Player instance.
 *
 * Returns:
 *  - `containerRef` – attach to the <div> where the player should render
 *  - `playerRef`    – current YT.Player instance (null until ready)
 *  - `isReady`      – true once the player has fired onReady
 */
export function useYouTubePlayer({
  videoId,
  playlistId,
  onStateChange,
  onReady,
  onError,
  playerVars,
}: UseYouTubePlayerOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Keep latest callbacks in refs so we don't recreate the player on every render
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!containerRef.current) return;
    if (!videoId && !playlistId) return;

    let destroyed = false;

    const init = async () => {
      await loadYouTubeAPI();
      if (destroyed || !containerRef.current) return;

      // Build playerVars, merging caller overrides
      const vars: YT.PlayerVars = {
        enablejsapi: 1,
        origin: window.location.origin,
        playsinline: 1,
        rel: 0,
        ...playerVars,
      };

      // If playlist-only (no video), configure list params
      if (!videoId && playlistId) {
        vars.listType = "playlist";
        vars.list = playlistId;
      } else if (videoId && playlistId) {
        // Video within a playlist context
        vars.list = playlistId;
      }

      const player = new YT.Player(containerRef.current, {
        videoId: videoId || undefined,
        playerVars: vars,
        events: {
          onReady: (event) => {
            if (destroyed) return;
            setIsReady(true);
            onReadyRef.current?.(event.target);
          },
          onStateChange: (event) => {
            if (destroyed) return;
            onStateChangeRef.current?.(event.data);
          },
          onError: (event) => {
            if (destroyed) return;
            onErrorRef.current?.(event.data);
          },
        },
      });

      playerRef.current = player;
    };

    init();

    return () => {
      destroyed = true;
      setIsReady(false);
      try {
        playerRef.current?.destroy();
      } catch {
        // Player may already be destroyed or iframe removed
      }
      playerRef.current = null;
    };
    // Recreate player when video/playlist changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId, playlistId]);

  return { containerRef, playerRef, isReady };
}
