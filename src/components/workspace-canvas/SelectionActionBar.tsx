import { cn } from "@/lib/utils";
import { X, Trash2, FolderInput, CheckCircle2 } from "lucide-react";
import { FaFolderPlus } from "react-icons/fa6";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface SelectionActionBarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onDeleteSelected: () => void;
  onCreateFolderFromSelection: () => void;
  onMoveSelected: () => void;
  isCompactMode?: boolean;
}

export default function SelectionActionBar({
  selectedCount,
  onClearSelection,
  onDeleteSelected,
  onCreateFolderFromSelection,
  onMoveSelected,
  isCompactMode = false,
}: SelectionActionBarProps) {
  return (
    <div
      className={cn(
        "absolute left-1/2 -translate-x-1/2 bottom-4",
        "inline-flex items-center gap-2 px-3 py-2 rounded-xl",
        "bg-white/5 border border-white/10",
        "shadow-lg backdrop-blur-md",
        "transition-all duration-300 ease-out",
        "animate-in slide-in-from-bottom-4"
      )}
    >
      {/* Selection count */}
      <span className="text-sm font-medium text-white/90 whitespace-nowrap">
        {isCompactMode ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-white/90" />
            <span>{selectedCount}</span>
          </div>
        ) : (
          `${selectedCount} ${selectedCount === 1 ? 'item' : 'items'} selected`
        )}
      </span>

      {/* Separator */}
      <div className="h-5 w-px bg-white/20" />

      {/* New Folder Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onCreateFolderFromSelection}
            className={cn(
              "inline-flex items-center gap-2 px-2 py-2 rounded-lg",
              "text-sm font-medium text-amber-400",
              "bg-amber-500/10 border border-amber-500/20",
              "hover:bg-amber-500/20 hover:border-amber-500/30",
              "transition-all duration-200"
            )}
            aria-label="Create folder from selection"
          >
            <FaFolderPlus className="h-4 w-4" />
            {!isCompactMode && <span>Folder</span>}
          </button>
        </TooltipTrigger>
        {isCompactMode && <TooltipContent side="top">New Folder</TooltipContent>}
      </Tooltip>

      {/* Move Selected Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onMoveSelected}
            className={cn(
              "inline-flex items-center gap-2 px-2 py-2 rounded-lg",
              "text-sm font-medium text-blue-400",
              "bg-blue-500/10 border border-blue-500/20",
              "hover:bg-blue-500/20 hover:border-blue-500/30",
              "transition-all duration-200"
            )}
            aria-label="Move selected"
          >
            <FolderInput className="h-4 w-4" />
            {!isCompactMode && <span>Move</span>}
          </button>
        </TooltipTrigger>
        {isCompactMode && <TooltipContent side="top">Move</TooltipContent>}
      </Tooltip>

      {/* Delete Selected Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onDeleteSelected}
            className={cn(
              "inline-flex items-center gap-2 px-2 py-2 rounded-lg",
              "text-sm font-medium text-red-400",
              "bg-red-500/10 border border-red-500/20",
              "hover:bg-red-500/20 hover:border-red-500/30",
              "transition-all duration-200"
            )}
            aria-label="Delete selected"
          >
            <Trash2 className="h-4 w-4" />
            {!isCompactMode && <span>Delete</span>}
          </button>
        </TooltipTrigger>
        {isCompactMode && <TooltipContent side="top">Delete</TooltipContent>}
      </Tooltip>

      {/* Separator before Clear */}
      <div className="h-5 w-px bg-white/20" />

      {/* Clear Selection Button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onClearSelection}
            className={cn(
              "inline-flex items-center justify-center p-2 rounded-lg",
              "text-white/60",
              "hover:text-white/90 hover:bg-white/5",
              "transition-all duration-200"
            )}
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top">Clear</TooltipContent>
      </Tooltip>
    </div>
  );
}

