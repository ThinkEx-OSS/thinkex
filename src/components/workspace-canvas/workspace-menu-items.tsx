"use client";

import type React from "react";
import { Folder, Upload, Play, Brain, Mic, Globe } from "lucide-react";
import { CgNotes } from "react-icons/cg";
import { LuBook } from "react-icons/lu";
import { PiCardsThreeBold } from "react-icons/pi";
import { useAudioRecordingStore } from "@/lib/stores/audio-recording-store";
import { toast } from "sonner";


export interface WorkspaceMenuCallbacks {
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onUpload: () => void;
  onAudio: () => void;
  onYouTube: () => void;
  onWebsite: () => void;
  onFlashcards: () => void;
  onQuiz: () => void;
}

/**
 * Shared "Create" menu items for both the header dropdown and the right-click
 * context menu.  The caller passes render helpers so the same logical items
 * can be rendered as either DropdownMenuItems or ContextMenuItems.
 */
export function renderWorkspaceMenuItems({
  callbacks,
  MenuItem,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
  MenuLabel,
  showUpload = true,
}: {
  callbacks: WorkspaceMenuCallbacks;
  MenuItem: React.ComponentType<{ onSelect?: () => void; className?: string; children: React.ReactNode }>;
  MenuSub: React.ComponentType<{ children: React.ReactNode }>;
  MenuSubTrigger: React.ComponentType<{ className?: string; children: React.ReactNode }>;
  MenuSubContent: React.ComponentType<{ children: React.ReactNode }>;
  MenuLabel?: React.ComponentType<{ className?: string; children: React.ReactNode }>;
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
        <MenuLabel className="text-xs text-muted-foreground px-2">Create</MenuLabel>
      )}

      <MenuItem
        onSelect={callbacks.onCreateNote}
        className="flex items-center gap-2 cursor-pointer"
      >
        <CgNotes className="size-4" />
        Note
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
          className="flex items-center gap-2 cursor-pointer p-2"
        >
          <Upload className="size-4" />
          <div className="flex items-center justify-between w-full">
            <span>Upload</span>
            <span className="text-xs text-muted-foreground">PDF/Image</span>
          </div>
        </MenuItem>
      )}

      <MenuItem
        onSelect={handleAudioClick}
        className="flex items-center gap-2 cursor-pointer p-2"
      >
        <Mic className="size-4" />
        <div className="flex items-center justify-between w-full">
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

      <MenuSub>
        <MenuSubTrigger className="flex items-center gap-2 cursor-pointer">
          <LuBook className="size-4 text-muted-foreground" />
          Learn
        </MenuSubTrigger>
        <MenuSubContent>
          <MenuItem
            onSelect={callbacks.onFlashcards}
            className="flex items-center gap-2 cursor-pointer"
          >
            <PiCardsThreeBold className="size-4 text-muted-foreground rotate-180" />
            Flashcards
          </MenuItem>
          <MenuItem
            onSelect={callbacks.onQuiz}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Brain className="size-4" />
            Quiz
          </MenuItem>
        </MenuSubContent>
      </MenuSub>
    </>
  );
}
