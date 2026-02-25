"use client";

import { FolderPlus, Mic } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { IconRenderer } from "@/hooks/use-icon-picker";

interface RecordWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: WorkspaceWithState[];
  loadingWorkspaces: boolean;
  onSelectNew: () => void;
  onSelectExisting: (slug: string) => void;
  createWorkspacePending: boolean;
}

/**
 * Dialog shown when user clicks Record on home.
 * Lets them choose to record in a new workspace or an existing one.
 */
export function RecordWorkspaceDialog({
  open,
  onOpenChange,
  workspaces,
  loadingWorkspaces,
  onSelectNew,
  onSelectExisting,
  createWorkspacePending,
}: RecordWorkspaceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-slot="record-workspace-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Record in workspace
          </DialogTitle>
          <DialogDescription>
            Choose where to add your recording.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 pt-2">
          <button
            type="button"
            onClick={onSelectNew}
            disabled={createWorkspacePending}
            className={cn(
              "flex items-center gap-2 w-full p-2 rounded-md border border-sidebar-border/50 bg-sidebar/50 text-left",
              "hover:bg-sidebar-accent/50 transition-colors",
              "disabled:opacity-50 disabled:pointer-events-none"
            )}
          >
            <div className="flex items-center flex-shrink-0">
              <FolderPlus className="size-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground">
              New workspace
            </div>
          </button>

          {workspaces.length > 0 && (
            <div className="rounded-md border border-sidebar-border/50 bg-sidebar/50 overflow-hidden">
                <ScrollArea className="h-[200px]">
                  <div className="flex flex-col py-1">
                    {workspaces.map((ws) => (
                      <button
                        key={ws.id}
                        type="button"
                        onClick={() => ws.slug && onSelectExisting(ws.slug)}
                        className={cn(
                          "flex items-center gap-2 w-full px-2 py-1.5 text-left",
                          "hover:bg-sidebar-accent/50 rounded mx-1",
                          "transition-colors cursor-pointer"
                        )}
                      >
                        <div className="flex items-center flex-shrink-0">
                          <IconRenderer
                            icon={ws.icon}
                            className="size-4"
                            style={{
                              color: (ws.color as string) || undefined,
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0 truncate text-xs text-sidebar-foreground">
                          {ws.name}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
          )}

          {!loadingWorkspaces && workspaces.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No workspaces yet. Create one to get started.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
