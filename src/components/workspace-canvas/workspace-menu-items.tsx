"use client";

import type React from "react";
import { Folder, Upload, Play, Mic, Globe, FileText } from "lucide-react";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { toast } from "sonner";

export interface WorkspaceMenuCallbacks {
  onCreateDocument: () => void;
  onCreateFolder: () => void;
  onUpload: () => void;
  onAudio: () => void;
  onYouTube: () => void;
  onWebsite: () => void;
}

export function renderWorkspaceMenuItems({
  callbacks,
  MenuItem,
  MenuSub: _MenuSub,
  MenuSubTrigger: _MenuSubTrigger,
  MenuSubContent: _MenuSubContent,
  MenuLabel,
  showUpload = true,
}: {
  callbacks: WorkspaceMenuCallbacks;
  MenuItem: React.ComponentType<{
    onSelect?: () => void;
    className?: string;
    children: React.ReactNode;
  }>;
  MenuSub: React.ComponentType<{ children: React.ReactNode }>;
  MenuSubTrigger: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  MenuSubContent: React.ComponentType<{ children: React.ReactNode }>;
  MenuLabel?: React.ComponentType<{
    className?: string;
    children: React.ReactNode;
  }>;
  showUpload?: boolean;
}) {
  const handleAudioClick = () => {
    const isRecording = useAudioRecordingStore.getState().isRecording;
    if (isRecording) {
      toast.error("Recording already in progress");
      return;
    }
    callbacks.onAudio();
  };

  return (
    <>
      {MenuLabel && (
        <MenuLabel className="px-2 text-xs text-muted-foreground">
          Create
        </MenuLabel>
      )}

      <MenuItem
        onSelect={callbacks.onCreateDocument}
        className="flex items-center gap-2 cursor-pointer"
      >
        <FileText className="size-4" />
        Document
      </MenuItem>

      <MenuItem
        onSelect={callbacks.onCreateFolder}
        className="flex items-center gap-2 cursor-pointer"
      >
        <Folder className="size-4" />
        Folder
      </MenuItem>

      {showUpload && (
        <MenuItem
          onSelect={callbacks.onUpload}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Upload className="size-4" />
          Upload
        </MenuItem>
      )}

      <MenuItem
        onSelect={handleAudioClick}
        className="flex items-center gap-2 cursor-pointer p-2"
      >
        <Mic className="size-4" />
        <div className="flex w-full items-center justify-between">
          <span>Audio</span>
          <span className="text-xs text-muted-foreground">Lecture/Meeting</span>
        </div>
      </MenuItem>

      <MenuItem
        onSelect={callbacks.onYouTube}
        className="flex items-center gap-2 cursor-pointer"
      >
        <Play className="size-4" />
        YouTube
      </MenuItem>

      <MenuItem
        onSelect={callbacks.onWebsite}
        className="flex items-center gap-2 cursor-pointer"
      >
        <Globe className="size-4" />
        Website
      </MenuItem>
    </>
  );
}
