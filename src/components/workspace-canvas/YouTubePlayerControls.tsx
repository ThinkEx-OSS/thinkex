"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, SkipBack, SkipForward } from "lucide-react";
import { cn } from "@/lib/utils";

interface YouTubePlayerControlsProps {
  playerRef: React.MutableRefObject<YT.Player | null>;
  isReady: boolean;
  /** Called when the user clicks the "Adjust" action (exit playing mode) */
  onAdjust: () => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function YouTubePlayerControls({ playerRef, isReady, onAdjust }: YouTubePlayerControlsProps) {
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Snapshot: read player state once (used on pause, on ready, etc.)
  const snapshotPlayer = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    try {
      const state = player.getPlayerState();
      const playing = state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING;
      setIsPlayerPlaying(playing);

      if (!isSeeking) {
        setCurrentTime(player.getCurrentTime());
      }

      const dur = player.getDuration();
      if (dur > 0) setDuration(dur);

      setVolume(player.getVolume());
      setIsMuted(player.isMuted());
    } catch {
      // Player may have been destroyed
    }
  }, [playerRef, isSeeking]);

  // Take an initial snapshot when the player becomes ready
  useEffect(() => {
    if (isReady) snapshotPlayer();
  }, [isReady, snapshotPlayer]);

  // Poll only while playing/buffering — stop polling when paused to avoid
  // unnecessary work and to keep the iframe from fighting for focus.
  useEffect(() => {
    if (!isReady || !isPlayerPlaying) {
      // Not playing — clear any existing poll
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    // Playing — poll at 250ms for smooth progress bar
    pollRef.current = setInterval(snapshotPlayer, 250);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [isReady, isPlayerPlaying, snapshotPlayer]);

  // Auto-hide controls after 2.5s of inactivity when playing
  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    if (isPlayerPlaying) {
      hideTimerRef.current = setTimeout(() => setShowControls(false), 2500);
    }
  }, [isPlayerPlaying]);

  // When paused, always show controls
  useEffect(() => {
    if (!isPlayerPlaying) {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      resetHideTimer();
    }
  }, [isPlayerPlaying, resetHideTimer]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFSChange);
    return () => document.removeEventListener("fullscreenchange", handleFSChange);
  }, []);

  // --- Handlers ---

  const handlePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const player = playerRef.current;
    if (!player) return;
    try {
      const state = player.getPlayerState();
      if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING) {
        player.pauseVideo();
        // Immediately reflect paused state (polling will stop)
        setIsPlayerPlaying(false);
      } else {
        player.playVideo();
        // Immediately reflect playing state (polling will start)
        setIsPlayerPlaying(true);
      }
      // Snapshot remaining state (time, volume, etc.)
      setTimeout(snapshotPlayer, 50);
    } catch {
      // ignore
    }
  }, [playerRef, snapshotPlayer]);

  const handleSeek = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!progressBarRef.current || !playerRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = fraction * duration;
    playerRef.current.seekTo(seekTime, true);
    setCurrentTime(seekTime);
  }, [playerRef, duration]);

  const handleSeekMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsSeeking(true);

    const onMouseMove = (ev: MouseEvent) => {
      if (!progressBarRef.current || duration <= 0) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      setCurrentTime(fraction * duration);
    };

    const onMouseUp = (ev: MouseEvent) => {
      if (progressBarRef.current && playerRef.current && duration > 0) {
        const rect = progressBarRef.current.getBoundingClientRect();
        const fraction = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        playerRef.current.seekTo(fraction * duration, true);
        setCurrentTime(fraction * duration);
      }
      setIsSeeking(false);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [playerRef, duration]);

  const handleVolumeChange = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!volumeBarRef.current || !playerRef.current) return;
    const rect = volumeBarRef.current.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newVol = Math.round(fraction * 100);
    playerRef.current.setVolume(newVol);
    if (newVol > 0) playerRef.current.unMute();
    setVolume(newVol);
    setIsMuted(newVol === 0);
  }, [playerRef]);

  const handleMuteToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const player = playerRef.current;
    if (!player) return;
    try {
      if (player.isMuted()) {
        player.unMute();
        setIsMuted(false);
      } else {
        player.mute();
        setIsMuted(true);
      }
    } catch {
      // ignore
    }
  }, [playerRef]);

  const handleSkipBack = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const player = playerRef.current;
    if (!player) return;
    try {
      player.seekTo(Math.max(0, player.getCurrentTime() - 10), true);
    } catch {
      // ignore
    }
  }, [playerRef]);

  const handleSkipForward = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const player = playerRef.current;
    if (!player) return;
    try {
      player.seekTo(Math.min(player.getDuration(), player.getCurrentTime() + 10), true);
    } catch {
      // ignore
    }
  }, [playerRef]);

  const handleFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        // Fullscreen the container that holds the iframe + controls
        const wrapper = containerRef.current?.closest("[data-youtube-content]") as HTMLElement | null;
        if (wrapper) {
          wrapper.requestFullscreen();
        }
      }
    } catch {
      // Fullscreen may not be supported
    }
  }, []);

  const handleAdjust = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      playerRef.current?.pauseVideo();
    } catch {
      // ignore
    }
    onAdjust();
  }, [playerRef, onAdjust]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-10"
      onMouseMove={resetHideTimer}
      onMouseEnter={resetHideTimer}
      onClick={handlePlayPause}
    >
      {/* Paused overlay: dim background + large centered play button */}
      {!isPlayerPlaying && isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 transition-opacity duration-200">
          <div className="w-16 h-16 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center shadow-lg hover:bg-black/70 transition-colors cursor-pointer">
            <Play className="h-8 w-8 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      {/* Bottom controls bar */}
      <div
        className={cn(
          "absolute bottom-0 left-0 right-0 transition-opacity duration-300 pointer-events-none",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        {/* Gradient backdrop */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent rounded-b-lg" />

        <div className="relative pointer-events-auto px-3 pb-2.5 pt-6">
          {/* Progress bar */}
          <div
            ref={progressBarRef}
            className="group/progress w-full h-1.5 bg-white/20 rounded-full cursor-pointer mb-2 hover:h-2.5 transition-all relative"
            onClick={handleSeek}
            onMouseDown={handleSeekMouseDown}
          >
            {/* Buffered / played track */}
            <div
              className="absolute inset-y-0 left-0 bg-red-500 rounded-full transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
            {/* Seek thumb */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-red-500 rounded-full shadow-md opacity-0 group-hover/progress:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 7px)` }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-1.5">
            {/* Play/Pause */}
            <button
              type="button"
              onClick={handlePlayPause}
              className="p-1 text-white hover:text-white/80 transition-colors cursor-pointer"
              aria-label={isPlayerPlaying ? "Pause" : "Play"}
            >
              {isPlayerPlaying ? (
                <Pause className="h-4.5 w-4.5 fill-white" />
              ) : (
                <Play className="h-4.5 w-4.5 fill-white ml-0.5" />
              )}
            </button>

            {/* Skip back 10s */}
            <button
              type="button"
              onClick={handleSkipBack}
              className="p-1 text-white/80 hover:text-white transition-colors cursor-pointer"
              aria-label="Skip back 10 seconds"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>

            {/* Skip forward 10s */}
            <button
              type="button"
              onClick={handleSkipForward}
              className="p-1 text-white/80 hover:text-white transition-colors cursor-pointer"
              aria-label="Skip forward 10 seconds"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>

            {/* Time display */}
            <span className="text-[11px] text-white/80 font-mono tabular-nums select-none ml-0.5">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Volume */}
            <div
              className="flex items-center gap-1"
              onMouseEnter={() => setIsVolumeHovered(true)}
              onMouseLeave={() => setIsVolumeHovered(false)}
            >
              <button
                type="button"
                onClick={handleMuteToggle}
                className="p-1 text-white/80 hover:text-white transition-colors cursor-pointer"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              <div
                className={cn(
                  "overflow-hidden transition-all duration-200",
                  isVolumeHovered ? "w-16 opacity-100" : "w-0 opacity-0"
                )}
              >
                <div
                  ref={volumeBarRef}
                  className="w-16 h-1 bg-white/20 rounded-full cursor-pointer relative"
                  onClick={handleVolumeChange}
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-white rounded-full"
                    style={{ width: `${isMuted ? 0 : volume}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Playback speed */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const player = playerRef.current;
                if (!player) return;
                try {
                  const rates = player.getAvailablePlaybackRates();
                  const currentIdx = rates.indexOf(playbackRate);
                  const nextIdx = (currentIdx + 1) % rates.length;
                  const nextRate = rates[nextIdx];
                  player.setPlaybackRate(nextRate);
                  setPlaybackRate(nextRate);
                } catch {
                  // fallback: cycle through common rates
                  const fallback = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
                  const idx = fallback.indexOf(playbackRate);
                  const next = fallback[(idx + 1) % fallback.length];
                  try {
                    player.setPlaybackRate(next);
                    setPlaybackRate(next);
                  } catch { /* ignore */ }
                }
              }}
              className="px-1.5 py-0.5 text-[11px] font-medium text-white/80 hover:text-white bg-white/10 hover:bg-white/20 rounded transition-colors cursor-pointer tabular-nums"
              aria-label="Playback speed"
            >
              {playbackRate}x
            </button>

            {/* Fullscreen */}
            <button
              type="button"
              onClick={handleFullscreen}
              className="p-1 text-white/80 hover:text-white transition-colors cursor-pointer"
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? (
                <Minimize className="h-4 w-4" />
              ) : (
                <Maximize className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Top bar: Adjust button (always visible on hover) */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 transition-opacity duration-300",
          showControls ? "opacity-100" : "opacity-0"
        )}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-transparent rounded-t-lg" />
        <div className="relative flex justify-start pt-2 pb-4 pl-2">
          <button
            type="button"
            onClick={handleAdjust}
            className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-white/90 hover:text-white bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-colors cursor-pointer"
          >
            Adjust
          </button>
        </div>
      </div>
    </div>
  );
}
