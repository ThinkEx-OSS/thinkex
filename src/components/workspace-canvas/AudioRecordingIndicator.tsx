"use client";

import { Mic, Square, Pause, Play } from "lucide-react";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { cn } from "@/lib/utils";
import { AudioWaveform } from "@/components/workspace-canvas/AudioWaveform";

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Floating pill that appears at the bottom of the screen when audio is recording
 * and the dialog is closed. Lets the user see the timer, pause/resume, stop,
 * or re-open the dialog.
 */
export function AudioRecordingIndicator() {
  const isRecording = useAudioRecordingStore((s) => s.isRecording);
  const isPaused = useAudioRecordingStore((s) => s.isPaused);
  const duration = useAudioRecordingStore((s) => s.duration);
  const isDialogOpen = useAudioRecordingStore((s) => s.isDialogOpen);
  const stopRecording = useAudioRecordingStore((s) => s.stopRecording);
  const pauseRecording = useAudioRecordingStore((s) => s.pauseRecording);
  const resumeRecording = useAudioRecordingStore((s) => s.resumeRecording);
  const openDialog = useAudioRecordingStore((s) => s.openDialog);

  // Only show when recording is active AND the dialog is closed
  if (!isRecording || isDialogOpen) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[100] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-2.5 rounded-full shadow-lg border backdrop-blur-md",
          "bg-background/95 border-border"
        )}
      >
        {/* Pulsing dot */}
        <span className="relative flex h-3 w-3">
          {!isPaused && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          )}
          <span
            className={cn(
              "relative inline-flex rounded-full h-3 w-3",
              isPaused ? "bg-yellow-400" : "bg-red-500"
            )}
          />
        </span>

        {/* Mini Waveform */}
        <AudioWaveform
          width={60}
          height={24}
          barCount={12}
          barColor={isPaused ? "rgba(156,163,175,0.5)" : "rgba(239,68,68,0.7)"}
        />

        {/* Timer */}
        <span className="text-sm font-mono font-semibold text-foreground tabular-nums">
          {formatDuration(duration)}
        </span>

        {/* Pause / Resume */}
        <button
          type="button"
          onClick={isPaused ? resumeRecording : pauseRecording}
          className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-muted transition-colors cursor-pointer"
          aria-label={isPaused ? "Resume recording" : "Pause recording"}
        >
          {isPaused ? (
            <Play className="h-3.5 w-3.5 text-foreground" />
          ) : (
            <Pause className="h-3.5 w-3.5 text-foreground" />
          )}
        </button>

        {/* Stop */}
        <button
          type="button"
          onClick={stopRecording}
          className="h-7 w-7 flex items-center justify-center rounded-full bg-red-500/10 hover:bg-red-500/20 transition-colors cursor-pointer"
          aria-label="Stop recording"
        >
          <Square className="h-3.5 w-3.5 text-red-500" />
        </button>

        {/* Expand to dialog */}
        <button
          type="button"
          onClick={openDialog}
          className="h-7 px-2.5 flex items-center gap-1.5 rounded-full hover:bg-muted transition-colors text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          aria-label="Open recording dialog"
        >
          <Mic className="h-3.5 w-3.5" />
          <span>Open</span>
        </button>
      </div>
    </div>
  );
}
