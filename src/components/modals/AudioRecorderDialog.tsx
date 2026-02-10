"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, Square, Upload, Loader2, Pause, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { cn } from "@/lib/utils";
import { AudioWaveform } from "@/components/workspace-canvas/AudioWaveform";

const ACCEPTED_AUDIO_TYPES = [
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/aiff",
  "audio/webm",
  "audio/mp4",
  "audio/x-m4a",
];

const ACCEPTED_EXTENSIONS = ".mp3,.wav,.ogg,.aac,.flac,.aiff,.webm,.m4a";

interface AudioRecorderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAudioReady: (file: File) => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function AudioRecorderDialog({
  open,
  onOpenChange,
  onAudioReady,
}: AudioRecorderDialogProps) {
  const isRecording = useAudioRecordingStore((s) => s.isRecording);
  const isPaused = useAudioRecordingStore((s) => s.isPaused);
  const duration = useAudioRecordingStore((s) => s.duration);
  const audioBlob = useAudioRecordingStore((s) => s.audioBlob);
  const error = useAudioRecordingStore((s) => s.error);
  const startRecording = useAudioRecordingStore((s) => s.startRecording);
  const stopRecording = useAudioRecordingStore((s) => s.stopRecording);
  const pauseRecording = useAudioRecordingStore((s) => s.pauseRecording);
  const resumeRecording = useAudioRecordingStore((s) => s.resumeRecording);
  const resetRecording = useAudioRecordingStore((s) => s.resetRecording);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);

  // Stable blob URL for audio preview — revoked on cleanup to avoid memory leaks
  const [audioBlobUrl, setAudioBlobUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!audioBlob) {
      setAudioBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(audioBlob);
    setAudioBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [audioBlob]);

  // Close dialog — if recording, just hide; if ready, confirm; if idle, fully close
  const handleClose = useCallback(() => {
    if (isRecording) {
      // Just hide the dialog — recording continues in the background
      onOpenChange(false);
      return;
    }
    if (audioBlob) {
      // Show confirmation dialog - recording will be lost
      setShowConfirmClose(true);
      return;
    }
    // Not recording and no blob — fully reset and close
    resetRecording();
    setIsSubmitting(false);
    onOpenChange(false);
  }, [isRecording, audioBlob, resetRecording, onOpenChange]);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (
        !ACCEPTED_AUDIO_TYPES.includes(file.type) &&
        !file.name.match(/\.(mp3|wav|ogg|aac|flac|aiff|webm|m4a)$/i)
      ) {
        return;
      }

      setIsSubmitting(true);
      onAudioReady(file);
      resetRecording();
      setIsSubmitting(false);
      onOpenChange(false);
    },
    [onAudioReady, resetRecording, onOpenChange]
  );

  const handleSubmitRecording = useCallback(() => {
    if (!audioBlob) return;

    const mimeType = audioBlob.type;
    let ext = "webm";
    if (mimeType.includes("mp4")) ext = "m4a";
    else if (mimeType.includes("ogg")) ext = "ogg";
    else if (mimeType.includes("wav")) ext = "wav";

    const filename = `recording-${Date.now()}.${ext}`;
    const file = new File([audioBlob], filename, { type: mimeType });

    setIsSubmitting(true);
    onAudioReady(file);
    resetRecording();
    setIsSubmitting(false);
    onOpenChange(false);
  }, [audioBlob, onAudioReady, resetRecording, onOpenChange]);

  const handleConfirmClose = useCallback(() => {
    // User confirmed - discard recording and close
    resetRecording();
    setIsSubmitting(false);
    setShowConfirmClose(false);
    onOpenChange(false);
  }, [resetRecording, onOpenChange]);

  const handleCancelClose = useCallback(() => {
    // User cancelled - keep dialog open
    setShowConfirmClose(false);
  }, []);

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) handleClose(); }}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>
              {isRecording 
                ? "Recording in progress..." 
                : audioBlob 
                  ? "Recording ready" 
                  : "Record audio"
              }
            </DialogTitle>
            <DialogDescription>
              {isRecording
              ? "You can close this dialog, recording continues in the background."
              : audioBlob
                ? ""
                : "Generate AI-powered summaries, transcripts, and timestamps from your audio"}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-6 py-4">
            {/* Recording Visualizer */}
            {isRecording ? (
              <div className="flex flex-col items-center gap-3">
                <AudioWaveform
                  width={280}
                  height={80}
                  barCount={40}
                  barColor={isPaused ? "rgba(156,163,175,0.5)" : "rgba(239,68,68,0.7)"}
                  className="rounded-lg"
                />
                <div className="flex items-center gap-2">
                  <Mic
                    className={cn(
                      "h-5 w-5",
                      isPaused
                        ? "text-muted-foreground"
                        : "text-red-500 dark:text-red-400"
                    )}
                  />
                  <span
                    className={cn(
                      "text-lg font-mono font-semibold",
                      isPaused
                        ? "text-muted-foreground"
                        : "text-red-600 dark:text-red-400"
                    )}
                  >
                    {formatDuration(duration)}
                  </span>
                </div>
              </div>
            ) : (
              <div
                className={cn(
                  "relative flex items-center justify-center w-32 h-32 rounded-full transition-all duration-300",
                  audioBlob
                    ? "bg-green-100 dark:bg-green-900/30"
                    : "bg-muted"
                )}
              >
                {audioBlob ? (
                  <div className="flex flex-col items-center gap-1 z-10">
                    <Mic className="h-10 w-10 text-green-600 dark:text-green-400" />
                    <span className="text-lg font-mono font-semibold text-green-600 dark:text-green-400">
                      {formatDuration(duration)}
                    </span>
                  </div>
                ) : (
                  <Mic className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center gap-3">
              {!isRecording && !audioBlob && (
                <Button
                  onClick={startRecording}
                  variant="default"
                  size="lg"
                  className="gap-2"
                >
                  <Mic className="h-4 w-4" />
                  Start Recording
                </Button>
              )}

              {isRecording && (
                <>
                  <Button
                    onClick={isPaused ? resumeRecording : pauseRecording}
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                  >
                    {isPaused ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Pause className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    onClick={stopRecording}
                    variant="destructive"
                    size="lg"
                    className="gap-2"
                  >
                    <Square className="h-4 w-4" />
                    Stop
                  </Button>
                </>
              )}

              {audioBlob && !isRecording && (
                <>
                  <Button
                    onClick={resetRecording}
                    variant="outline"
                    size="lg"
                  >
                    Re-record
                  </Button>
                  <Button
                    onClick={handleSubmitRecording}
                    disabled={isSubmitting}
                    size="lg"
                    className="gap-2"
                  >
                    {isSubmitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Use Recording
                  </Button>
                </>
              )}
            </div>

            {/* Preview audio playback */}
            {audioBlobUrl && !isRecording && (
              <audio
                controls
                src={audioBlobUrl}
                className="w-full max-w-xs h-10 rounded-lg"
              />
            )}

            {/* Error */}
            {error && (
              <p className="text-sm text-destructive text-center">{error}</p>
            )}

            {/* Divider + File Upload */}
            {!isRecording && !audioBlob && (
              <>
                <div className="flex items-center gap-3 w-full">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  Upload Audio File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_EXTENSIONS}
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <p className="text-xs text-muted-foreground text-center">
                  MP3, WAV, OGG, AAC, FLAC, AIFF, WebM, M4A
                </p>
              </>
            )}
          </div>

          <DialogFooter>
            {isRecording && (
              <Button variant="outline" onClick={handleClose}>
                Minimize — keep recording
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmClose} onOpenChange={setShowConfirmClose}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard recording?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close? Your recording will be lost if you don't save it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelClose}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmClose} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Discard Recording
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default AudioRecorderDialog;
