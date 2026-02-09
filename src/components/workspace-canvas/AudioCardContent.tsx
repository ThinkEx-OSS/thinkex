"use client";

import { useState } from "react";
import { Mic, ChevronDown, ChevronUp, AlertCircle, Loader2, Clock, User, Globe } from "lucide-react";
import type { Item, AudioData, AudioSegment } from "@/lib/workspace-state/types";
import { cn } from "@/lib/utils";

interface AudioCardContentProps {
  item: Item;
  isCompact?: boolean;
}

export function AudioCardContent({ item, isCompact = false }: AudioCardContentProps) {
  const audioData = item.data as AudioData;
  const [showTranscript, setShowTranscript] = useState(false);
  const [showSegments, setShowSegments] = useState(false);

  // Uploading state
  if (audioData.processingStatus === "uploading") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Uploading audio...</p>
      </div>
    );
  }

  // Processing state
  if (audioData.processingStatus === "processing") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
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

  // Failed state
  if (audioData.processingStatus === "failed") {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-destructive/70" />
        <div>
          <p className="text-sm font-medium text-foreground">Processing failed</p>
          <p className="text-xs text-muted-foreground mt-1">
            {audioData.error || "An error occurred while processing the audio."}
          </p>
        </div>
      </div>
    );
  }

  // Complete state
  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Summary */}
      {audioData.summary && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Summary
          </h4>
          <p className={cn(
            "text-sm text-foreground leading-relaxed",
            isCompact && "line-clamp-3"
          )}>
            {audioData.summary}
          </p>
        </div>
      )}

      {/* Full Transcript Toggle */}
      {audioData.transcript && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setShowTranscript(!showTranscript)}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer"
          >
            Transcript
            {showTranscript ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {showTranscript && (
            <div className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap bg-muted/30 rounded-lg p-3 max-h-60 overflow-y-auto">
              {audioData.transcript}
            </div>
          )}
        </div>
      )}

      {/* Segments Toggle */}
      {audioData.segments && audioData.segments.length > 0 && (
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setShowSegments(!showSegments)}
            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors cursor-pointer"
          >
            Segments ({audioData.segments.length})
            {showSegments ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </button>
          {showSegments && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {audioData.segments.map((segment, idx) => (
                <SegmentRow key={idx} segment={segment} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SegmentRow({ segment }: { segment: AudioSegment }) {
  return (
    <div className="bg-muted/30 rounded-lg p-2.5 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {segment.timestamp}
        </span>
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {segment.speaker}
        </span>
        {segment.language && segment.language !== "English" && (
          <span className="flex items-center gap-1">
            <Globe className="h-3 w-3" />
            {segment.language}
          </span>
        )}
        {segment.emotion && segment.emotion !== "neutral" && (
          <span className="capitalize text-xs px-1.5 py-0.5 rounded-full bg-muted">
            {segment.emotion}
          </span>
        )}
      </div>
      <p className="text-sm text-foreground">{segment.content}</p>
      {segment.translation && (
        <p className="text-xs text-muted-foreground italic">
          Translation: {segment.translation}
        </p>
      )}
    </div>
  );
}

export default AudioCardContent;
