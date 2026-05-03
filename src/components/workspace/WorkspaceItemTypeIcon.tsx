"use client";

import { File, FileText, Folder as FolderIcon, ImageIcon, Mic, Play, Brain } from "lucide-react";
import { PiCardsThreeBold } from "react-icons/pi";
import type { CardType } from "@/lib/workspace-state/types";
import { cn } from "@/lib/utils";

interface WorkspaceItemTypeIconProps {
  type: CardType;
  className?: string;
}

export function WorkspaceItemTypeIcon({ type, className }: WorkspaceItemTypeIconProps) {
  switch (type) {
    case "document":
      return <FileText className={cn("text-sky-400", className)} />;
    case "pdf":
      return <File className={cn("text-red-400", className)} />;
    case "flashcard":
      return <PiCardsThreeBold className={cn("rotate-180 text-purple-400", className)} />;
    case "quiz":
      return <Brain className={cn("text-green-400", className)} />;
    case "youtube":
      return <Play className={cn("text-red-500", className)} />;
    case "folder":
      return <FolderIcon className={cn("text-amber-400", className)} />;
    case "image":
      return <ImageIcon className={cn("text-emerald-500", className)} />;
    case "audio":
      return <Mic className={cn("text-orange-400", className)} />;
    default:
      return <FileText className={cn("text-muted-foreground", className)} />;
  }
}
