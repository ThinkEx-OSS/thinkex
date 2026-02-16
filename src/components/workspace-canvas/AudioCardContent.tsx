"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  Globe,
  RotateCcw,
  Copy,
  Check,
} from "lucide-react";
import type { Item, AudioData, AudioSegment } from "@/lib/workspace-state/types";
import { cn } from "@/lib/utils";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse "MM:SS" or "H:MM:SS" timestamp to seconds */
function parseTimestamp(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/** Format seconds to MM:SS */
function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

const SPEAKER_COLORS = [
  "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400",
];

const EMOTION_ICONS: Record<string, string> = {
  happy: "😊",
  sad: "😢",
  angry: "😠",
};

// ─── Component ──────────────────────────────────────────────────────────────

interface AudioCardContentProps {
  item: Item;
  isCompact?: boolean;
  isScrollLocked?: boolean;
}

export function AudioCardContent({ item, isCompact = false, isScrollLocked = false }: AudioCardContentProps) {
  const audioData = item.data as AudioData;
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = useCallback(() => {
    if (!audioData.fileUrl || isRetrying) return;
    setIsRetrying(true);

    // Immediately transition card to "processing" via the same event system
    window.dispatchEvent(
      new CustomEvent("audio-processing-complete", {
        detail: { itemId: item.id, retrying: true },
      })
    );

    fetch("/api/audio/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileUrl: audioData.fileUrl,
        filename: audioData.filename,
        mimeType: audioData.mimeType || "audio/webm",
      }),
    })
      .then((res) => res.json())
      .then((result) => {
        window.dispatchEvent(
          new CustomEvent("audio-processing-complete", {
            detail: result.success
              ? {
                  itemId: item.id,
                  summary: result.summary,
                  segments: result.segments,
                  duration: result.duration,
                }
              : { itemId: item.id, error: result.error || "Processing failed" },
          })
        );
      })
      .catch((err) => {
        window.dispatchEvent(
          new CustomEvent("audio-processing-complete", {
            detail: { itemId: item.id, error: err.message || "Processing failed" },
          })
        );
      })
      .finally(() => setIsRetrying(false));
  }, [audioData.fileUrl, audioData.filename, audioData.mimeType, item.id, isRetrying]);

  // ── Loading / Error states ──────────────────────────────────────────────

  if (audioData.processingStatus === "uploading") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Uploading audio...</p>
      </div>
    );
  }

  if (audioData.processingStatus === "processing") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full p-6 text-center">
        <div className="relative">
          <Mic className="h-8 w-8 text-primary/60" />
          <Loader2 className="absolute -top-1 -right-1 h-4 w-4 animate-spin text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Analyzing audio...</p>
          <p className="text-xs text-muted-foreground mt-1">
            Generating transcript and summary with Gemini
          </p>
        </div>
      </div>
    );
  }

  if (audioData.processingStatus === "failed") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full p-6 text-center">
        <AlertCircle className="h-8 w-8 text-destructive/70" />
        <div>
          <p className="text-sm font-medium text-foreground">Processing failed</p>
          <p className="text-xs text-muted-foreground mt-1">
            {audioData.error || "An error occurred while processing the audio."}
          </p>
        </div>
        {audioData.fileUrl && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isRetrying ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            {isRetrying ? "Retrying..." : "Retry"}
          </button>
        )}
      </div>
    );
  }

  // ── Complete state ──────────────────────────────────────────────────────

  return <AudioCardComplete audioData={audioData} isCompact={isCompact} isScrollLocked={isScrollLocked} />;
}

// ─── Complete state (with player) ───────────────────────────────────────────

/** Compute duration from segments when audio.duration is NaN (common for WebM/MediaRecorder) */
function getDurationFromSegments(segments: AudioSegment[] | undefined): number {
  if (!segments || segments.length === 0) return 0;
  const lastTs = parseTimestamp(segments[segments.length - 1].timestamp);
  return lastTs + 45; // Buffer for last segment content
}

function AudioCardComplete({
  audioData,
  isCompact,
  isScrollLocked,
}: {
  audioData: AudioData;
  isCompact: boolean;
  isScrollLocked?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const durationFromSegments = getDurationFromSegments(audioData.segments);
  const initialDuration =
    (audioData.duration != null && audioData.duration > 0)
      ? audioData.duration
      : durationFromSegments;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(initialDuration);
  const [isMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [activeSegmentIdx, setActiveSegmentIdx] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);

  // Build speaker → color map
  const speakerColorMap = useRef(new Map<string, string>());
  if (audioData.segments) {
    let colorIdx = 0;
    for (const seg of audioData.segments) {
      if (!speakerColorMap.current.has(seg.speaker)) {
        speakerColorMap.current.set(
          seg.speaker,
          SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length]
        );
        colorIdx++;
      }
    }
  }

  // ── Audio event handlers (only for non-compact view) ────────────────────────

  useEffect(() => {
    if (isCompact) return; // Skip audio setup in compact view
    
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const applyDuration = (d: number) => {
      if (d > 0 && isFinite(d)) setDuration(d);
    };
    const onLoadedMetadata = () => applyDuration(audio.duration);
    const onDurationChange = () => applyDuration(audio.duration);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => {
      setIsPlaying(false);
      // WebM/MediaRecorder often has NaN duration - capture actual length when playback ends
      if (audio.currentTime > 0 && (!audio.duration || !isFinite(audio.duration))) {
        setDuration(audio.currentTime);
      }
      setCurrentTime(0);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      // Pause audio when component unmounts (e.g. closing modal mid-play)
      audio.pause();
    };
  }, [isCompact]);

  // Update audio playback rate when it changes
  useEffect(() => {
    if (audioRef.current && !isCompact) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, isCompact]);

  // Track active segment based on current time (only for non-compact view)
  useEffect(() => {
    if (isCompact || !audioData.segments || audioData.segments.length === 0) return;
    let active = -1;
    for (let i = 0; i < audioData.segments.length; i++) {
      const segTime = parseTimestamp(audioData.segments[i].timestamp);
      if (currentTime >= segTime) active = i;
      else break;
    }
    setActiveSegmentIdx(active);
  }, [currentTime, audioData.segments, isCompact]);

  const togglePlay = useCallback(() => {
    if (isCompact) return; // Disable in compact view
    
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {
        // play() can reject if interrupted by another call or browser policy
      });
    } else {
      audio.pause();
    }
    // isPlaying state is driven by 'play'/'pause' events — no manual set here
  }, [isCompact]);

  // Spacebar to toggle play/pause (only for non-compact/modal view)
  useEffect(() => {
    if (isCompact) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      // Don't hijack spacebar when user is typing in an input/textarea/button
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      togglePlay();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCompact, togglePlay]);

  const seekTo = useCallback((seconds: number) => {
    if (isCompact) return; // Disable in compact view
    
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
    if (audio.paused) {
      audio.play().catch(() => {
        // play() can reject if interrupted by another call or browser policy
      });
    }
    // isPlaying state is driven by 'play'/'pause' events — no manual set here
  }, [isCompact]);

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (isCompact) return; // Disable in compact view
      
      const bar = progressRef.current;
      if (!bar || !duration) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(pct * duration);
    },
    [duration, seekTo, isCompact]
  );

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col h-full">
      {/* Hidden audio element (only for non-compact view) */}
      {!isCompact && <audio ref={audioRef} src={audioData.fileUrl} muted={isMuted} preload="metadata" />}

      {/* ── Player (only in full view) ─────────────────────────────────────────── */}
      {!isCompact && (
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2.5">
            {/* Play / Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="flex-shrink-0 h-9 w-9 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors cursor-pointer"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </button>

            {/* Progress + time */}
            <div className="flex-1 min-w-0">
              {/* Seekable progress bar */}
              <div
                ref={progressRef}
                onClick={handleProgressClick}
                className="group relative h-5 flex items-center cursor-pointer"
                role="slider"
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={currentTime}
              >
                <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-100"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {/* Thumb */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-primary shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progress}% - 6px)` }}
                />
              </div>

              {/* Time labels */}
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono -mt-0.5">
                <span>{fmtTime(currentTime)}</span>
                <span>{fmtTime(duration)}</span>
              </div>
            </div>

            {/* Playback speed toggle */}
            <button
              type="button"
              onClick={() => setPlaybackRate(playbackRate === 1 ? 2 : 1)}
              className="flex-shrink-0 h-7 px-2 flex items-center justify-center rounded-full hover:bg-muted transition-colors cursor-pointer text-muted-foreground hover:text-foreground text-[10px] font-mono font-medium"
              aria-label={`Playback speed: ${playbackRate}x`}
            >
              {playbackRate}x
            </button>
          </div>
        </div>
      )}

      {/* ── Scrollable content ──────────────────────────────────────────── */}
      <div className={cn(
        "flex-1 min-h-0 px-4 pb-4 space-y-3",
        isScrollLocked ? "overflow-hidden" : "overflow-y-auto"
      )}>
        {/* Summary */}
        {audioData.summary && (
          <div className="space-y-1.5 pt-2">
            {isCompact ? (
              <>
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Summary
                </h4>
                <p className="text-sm text-foreground/90 leading-relaxed line-clamp-3">
                  {audioData.summary}
                </p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowSummary(!showSummary)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer"
                >
                  Summary
                  {showSummary ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
                {showSummary && (
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {audioData.summary}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* Segments */}
        {audioData.segments && audioData.segments.length > 0 && (
          <div className="space-y-1.5">
            {isCompact ? (
              <>
                <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Timeline
                </h4>
                <div className="space-y-1 p-1 -m-1">
                  {/* Show only first 3 segments in compact view */}
                  {audioData.segments.slice(0, 3).map((segment, idx) => (
                    <SegmentRow
                      key={idx}
                      segment={segment}
                      isActive={false}
                      speakerColor={speakerColorMap.current.get(segment.speaker) ?? SPEAKER_COLORS[0]}
                      onSeek={undefined}
                      isCompact={isCompact}
                    />
                  ))}
                  {/* Show ellipsis if there are more than 3 segments */}
                  {audioData.segments.length > 3 && (
                    <div className="text-center text-[10px] text-muted-foreground py-2">
                      ... {audioData.segments.length - 3} more timestamps
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setShowTimeline(!showTimeline)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer"
                >
                  Timeline
                  {showTimeline ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                </button>
                {showTimeline && (
                  <div className="space-y-1 p-1 -m-1 max-h-[500px] overflow-y-auto">
                    {/* Show all segments in full modal view */}
                    {audioData.segments.map((segment, idx) => (
                      <SegmentRow
                        key={idx}
                        segment={segment}
                        isActive={idx === activeSegmentIdx}
                        speakerColor={speakerColorMap.current.get(segment.speaker) ?? SPEAKER_COLORS[0]}
                        onSeek={() => seekTo(parseTimestamp(segment.timestamp))}
                        isCompact={isCompact}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Copy Timeline as Transcript */}
        {audioData.segments && audioData.segments.length > 0 && !isCompact && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                const text = audioData.segments!
                  .map((s) => `[${s.timestamp}] ${s.speaker}: ${s.content}`)
                  .join("\n");
                navigator.clipboard.writeText(text).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              {copied ? "Copied!" : "Copy Transcript"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Segment Row ────────────────────────────────────────────────────────────

function SegmentRow({
  segment,
  isActive,
  speakerColor,
  onSeek,
  isCompact,
}: {
  segment: AudioSegment;
  isActive: boolean;
  speakerColor: string;
  onSeek?: () => void;
  isCompact: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSeek}
      disabled={!onSeek}
      className={cn(
        "w-full text-left rounded-lg p-2 transition-all cursor-pointer group",
        "hover:bg-muted/50",
        isActive
          ? "bg-primary/5 ring-1 ring-primary/20"
          : "bg-transparent",
        !onSeek && "cursor-default pointer-events-none"
      )}
    >
      {/* Header: timestamp + speaker + emotion */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] font-mono text-muted-foreground group-hover:text-primary transition-colors">
          {segment.timestamp}
        </span>
        <span
          className={cn(
            "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            speakerColor
          )}
        >
          {segment.speaker}
        </span>
        {segment.language && segment.language !== "English" && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Globe className="h-2.5 w-2.5" />
            {segment.language}
          </span>
        )}
        {segment.emotion && segment.emotion !== "neutral" && EMOTION_ICONS[segment.emotion] && (
          <span className="text-xs">{EMOTION_ICONS[segment.emotion]}</span>
        )}
      </div>

      {/* Content */}
      <p
        className={cn(
          "text-sm text-foreground/90 leading-relaxed",
          isCompact && "line-clamp-2"
        )}
      >
        {segment.content}
      </p>

      {/* Translation */}
      {segment.translation && (
        <p className="text-xs text-muted-foreground italic mt-0.5">
          {segment.translation}
        </p>
      )}
    </button>
  );
}

export default AudioCardContent;
