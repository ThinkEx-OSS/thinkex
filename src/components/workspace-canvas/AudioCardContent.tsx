"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useCurrentWorkspaceId } from "@/contexts/WorkspaceContext";
import {
  AudioLines,
  Mic,
  AlertCircle,
  Loader2,
  Globe,
  RotateCcw,
  Copy,
  Check,
} from "lucide-react";
import type {
  Item,
  AudioData,
  AudioSegment,
} from "@/lib/workspace-state/types";
import { cn } from "@/lib/utils";
import { startAudioProcessing } from "@/lib/audio/start-audio-processing";
import { useTranscriptSegments } from "@/hooks/workspace/use-transcript-segments";
import {
  AudioPlayer,
  AudioPlayerControlBar,
  AudioPlayerDurationDisplay,
  AudioPlayerElement,
  AudioPlayerMuteButton,
  AudioPlayerPlayButton,
  AudioPlayerSeekBackwardButton,
  AudioPlayerSeekForwardButton,
  AudioPlayerTimeDisplay,
  AudioPlayerTimeRange,
  AudioPlayerVolumeRange,
} from "@/components/ai-elements/audio-player";

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Parse "MM:SS" or "H:MM:SS" timestamp to seconds */
function parseTimestamp(ts: string): number {
  const parts = ts.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function formatAudioDuration(seconds: number | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return "Audio";
  }

  const totalSeconds = Math.round(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
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

export function AudioCardContent({
  item,
  isCompact = false,
  isScrollLocked = false,
}: AudioCardContentProps) {
  const workspaceId = useCurrentWorkspaceId();
  const audioData = item.data as AudioData;
  const [isRetrying, setIsRetrying] = useState(false);

  if (isCompact) {
    const compactLabel =
      audioData.processingStatus === "uploading"
        ? "Uploading..."
        : audioData.processingStatus === "processing"
          ? "Processing..."
          : audioData.processingStatus === "failed"
            ? "Preview unavailable"
            : formatAudioDuration(audioData.duration);

    return (
      <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-md px-4 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-foreground/8 text-muted-foreground">
          {audioData.processingStatus === "uploading" ||
          audioData.processingStatus === "processing" ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : audioData.processingStatus === "failed" ? (
            <AlertCircle className="h-5 w-5" />
          ) : (
            <AudioLines className="h-5 w-5" />
          )}
        </div>
        <p className="text-sm text-muted-foreground">{compactLabel}</p>
      </div>
    );
  }

  const handleRetry = useCallback(() => {
    if (!audioData.fileUrl || !workspaceId || isRetrying) return;
    setIsRetrying(true);

    // Immediately transition card to "processing" via the same event system
    window.dispatchEvent(
      new CustomEvent("audio-processing-complete", {
        detail: { itemId: item.id, retrying: true },
      }),
    );

    startAudioProcessing({
      workspaceId,
      itemId: item.id,
      fileUrl: audioData.fileUrl,
      filename: audioData.filename,
      mimeType: audioData.mimeType || "audio/webm",
    }).finally(() => setIsRetrying(false));
  }, [
    audioData.fileUrl,
    audioData.filename,
    audioData.mimeType,
    item.id,
    workspaceId,
    isRetrying,
  ]);

  // ── Loading / Error states ──────────────────────────────────────────────

  if (audioData.processingStatus === "uploading") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Uploading audio...</p>
        <p className="text-xs text-muted-foreground/80">
          Don&apos;t close — upload in progress
        </p>
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
          <p className="text-sm font-medium text-foreground">
            Analyzing audio...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Generating transcript and summary
          </p>
          <p className="text-xs text-muted-foreground/80 mt-1">
            Safe to close — transcript ready when you return
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
          <p className="text-sm font-medium text-foreground">
            Processing failed
          </p>
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

  return (
    <AudioCardComplete
      workspaceId={workspaceId}
      itemId={item.id}
      audioData={audioData}
      isCompact={isCompact}
      isScrollLocked={isScrollLocked}
    />
  );
}

// ─── Complete state (with player) ───────────────────────────────────────────

function AudioCardComplete({
  workspaceId,
  itemId,
  audioData,
  isCompact,
  isScrollLocked,
}: {
  workspaceId: string | null;
  itemId: string;
  audioData: AudioData;
  isCompact: boolean;
  isScrollLocked?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const isRepairingDurationRef = useRef(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [activeSegmentIdx, setActiveSegmentIdx] = useState(-1);
  const [copied, setCopied] = useState(false);

  const hasEagerSegments =
    Array.isArray(audioData.segments) && audioData.segments.length > 0;
  const shouldFetchSegments =
    !hasEagerSegments && audioData.processingStatus === "complete";
  const {
    data: transcriptData,
    isLoading: isLoadingSegments,
    error: transcriptError,
  } = useTranscriptSegments(workspaceId, itemId, shouldFetchSegments);
  const segments = hasEagerSegments
    ? (audioData.segments ?? [])
    : (transcriptData?.segments ?? []);
  const transcript =
    (hasEagerSegments ? audioData.transcript : null) ??
    transcriptData?.transcript ??
    audioData.transcript ??
    (segments.length > 0
      ? segments
          .map(
            (segment) =>
              `[${segment.timestamp}] ${segment.speaker}: ${segment.content}`,
          )
          .join("\n")
      : null);

  const speakerColorMap = useMemo(() => {
    const map = new Map<string, string>();
    let colorIdx = 0;

    for (const segment of segments) {
      if (!map.has(segment.speaker)) {
        map.set(
          segment.speaker,
          SPEAKER_COLORS[colorIdx % SPEAKER_COLORS.length],
        );
        colorIdx += 1;
      }
    }

    return map;
  }, [segments]);

  // ── Audio event handlers (only for non-compact view) ────────────────────────

  // Track current time for active-segment highlighting. Skip while we're
  // repairing WebM duration (see effect below) — the seek to 1e101 fires
  // intermediate timeupdate events at the clamped duration that would
  // momentarily highlight the last segment before we reset to 0.
  useEffect(() => {
    if (isCompact) return;
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => {
      if (isRepairingDurationRef.current) return;
      setCurrentTimeSec(audio.currentTime);
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    return () => audio.removeEventListener("timeupdate", onTimeUpdate);
  }, [isCompact]);

  // Compute active segment from current time.
  useEffect(() => {
    if (isCompact || segments.length === 0) return;
    let active = -1;
    for (let i = 0; i < segments.length; i++) {
      const segTime = parseTimestamp(segments[i].timestamp);
      if (currentTimeSec >= segTime) active = i;
      else break;
    }
    setActiveSegmentIdx(active);
  }, [currentTimeSec, segments, isCompact]);

  // WebM/MediaRecorder NaN duration fix. MediaRecorder produces WebM blobs
  // without duration metadata, causing audio.duration to be Infinity or NaN.
  // Without this, media-chrome's MediaTimeRange/MediaDurationDisplay show
  // 0:00 or stuck progress. Apply the standard "seek-to-huge-time" trick
  // when metadata loads with a bad duration to force the browser to scan
  // the WebM and compute its real duration.
  useEffect(() => {
    if (isCompact) return;
    const audio = audioRef.current;
    if (!audio) return;
    const onLoadedMetadata = () => {
      if (
        audio.duration === Number.POSITIVE_INFINITY ||
        Number.isNaN(audio.duration) ||
        audio.duration === 0
      ) {
        // Gate the time-tracking listener for the entire repair window so
        // intermediate currentTime values from the scan don't flicker the
        // active-segment highlight.
        isRepairingDurationRef.current = true;
        const onSeeked = () => {
          audio.removeEventListener("seeked", onSeeked);
          isRepairingDurationRef.current = false;
        };
        const onTimeUpdate = () => {
          // Wait for the browser to compute a real duration before resetting.
          if (
            audio.duration === Number.POSITIVE_INFINITY ||
            Number.isNaN(audio.duration) ||
            audio.duration === 0
          ) {
            return;
          }
          audio.removeEventListener("timeupdate", onTimeUpdate);
          // Clear the gate only after the seek-to-0 settles.
          audio.addEventListener("seeked", onSeeked);
          audio.currentTime = 0;
        };
        audio.addEventListener("timeupdate", onTimeUpdate);
        // Seek to a far-future time to force the browser to scan the WebM
        // and compute its duration. The browser clamps to actual duration.
        audio.currentTime = 1e101;
      }
    };
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    return () => audio.removeEventListener("loadedmetadata", onLoadedMetadata);
  }, [isCompact]);

  // Pause audio on unmount (e.g. closing modal mid-play).
  useEffect(() => {
    if (isCompact) return;
    const audio = audioRef.current;
    return () => {
      if (audio) audio.pause();
    };
  }, [isCompact]);

  const seekTo = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seconds;
    if (audio.paused) {
      audio.play().catch(() => {
        // play() can reject if interrupted by another call or browser policy
      });
    }
  }, []);

  // ── Compact view ────────────────────────────────────────────────────────

  // ── Non-compact view ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col">
      {/* Sticky header: player + Copy Transcript button */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border/40">
        <div className="px-4 pt-3 pb-2">
          <AudioPlayer className="w-full">
            <AudioPlayerElement
              ref={audioRef}
              src={audioData.fileUrl}
              preload="metadata"
            />
            <AudioPlayerControlBar>
              <AudioPlayerPlayButton />
              <AudioPlayerSeekBackwardButton />
              <AudioPlayerSeekForwardButton />
              <AudioPlayerTimeDisplay />
              <AudioPlayerTimeRange />
              <AudioPlayerDurationDisplay />
              <AudioPlayerMuteButton />
              <AudioPlayerVolumeRange />
            </AudioPlayerControlBar>
          </AudioPlayer>
        </div>
        {!!transcript && (
          <div className="px-4 pb-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(transcript).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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

      {/* Body — flows naturally; the parent ItemPanelContent provides scroll */}
      <div className="px-4 pt-3 pb-6 space-y-4">
        {audioData.processingStatus === "complete" && (
          <div className="space-y-1.5">
            <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Timeline
            </h4>
            {isLoadingSegments && segments.length === 0 ? (
              <TranscriptSegmentsSkeleton />
            ) : transcriptError ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Failed to load transcript.
              </div>
            ) : segments.length > 0 ? (
              <div className="space-y-1 p-1 -m-1">
                {segments.map((segment, idx) => (
                  <SegmentRow
                    key={idx}
                    segment={segment}
                    isActive={idx === activeSegmentIdx}
                    speakerColor={
                      speakerColorMap.get(segment.speaker) ?? SPEAKER_COLORS[0]
                    }
                    onSeek={() => seekTo(parseTimestamp(segment.timestamp))}
                    isCompact={isCompact}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Transcript unavailable.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TranscriptSegmentsSkeleton({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <div className={cn("space-y-2", compact && "p-1 -m-1")}>
      {Array.from({ length: compact ? 2 : 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
        >
          <div className="h-3 w-24 rounded bg-muted animate-pulse" />
          <div className="mt-2 h-3 w-full rounded bg-muted animate-pulse" />
          <div className="mt-1 h-3 w-4/5 rounded bg-muted animate-pulse" />
        </div>
      ))}
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
        isActive ? "bg-primary/5 ring-1 ring-primary/20" : "bg-transparent",
        !onSeek && "cursor-default pointer-events-none",
      )}
    >
      {/* Header: timestamp + speaker + emotion */}
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[10px] font-mono text-muted-foreground group-hover:text-primary transition-colors">
          {segment.timestamp}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            speakerColor,
          )}
        >
          <span className="font-normal opacity-75">Speaker:</span>
          {segment.speaker}
        </span>
        {segment.language && segment.language !== "English" && (
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
            <Globe className="h-2.5 w-2.5" />
            {segment.language}
          </span>
        )}
        {segment.emotion &&
          segment.emotion !== "neutral" &&
          EMOTION_ICONS[segment.emotion] && (
            <span className="text-xs">{EMOTION_ICONS[segment.emotion]}</span>
          )}
      </div>

      {/* Content */}
      <p
        className={cn(
          "text-sm text-foreground/90 leading-relaxed",
          isCompact && "line-clamp-2",
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
