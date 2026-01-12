"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Clock, User, Undo2, Calendar, AlertCircle, Camera } from "lucide-react";
import type { WorkspaceEvent, SnapshotInfo } from "@/lib/workspace/events";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import { useWorkspaceSnapshots } from "@/hooks/workspace/use-workspace-snapshots";

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  events: WorkspaceEvent[];
  currentVersion: number;
  onRevertToVersion: (version: number) => void;
  items?: any[]; // Add items to look up titles
  workspaceId: string | null; // Add workspaceId to fetch snapshots
}

function getEventIcon(event: WorkspaceEvent) {
  switch (event.type) {
    case 'ITEM_CREATED':
      return '➕';
    case 'ITEM_UPDATED':
      return '✏️';
    case 'ITEM_DELETED':
      return '🗑️';
    case 'GLOBAL_TITLE_SET':
    case 'GLOBAL_DESCRIPTION_SET':
      return '📝';
    case 'BULK_ITEMS_UPDATED': {
      // Support both new format (layoutUpdates) and legacy format (items array)
      // For new format (layoutUpdates), we can't determine deletions from layout changes alone
      // Only check for deletions if we have the full items array (legacy format)
      if (event.payload.items) {
        // Legacy format: can check for deletions
        const itemCount = event.payload.items.length;
        const prevCount = event.payload.previousItemCount;
        if (prevCount !== undefined && prevCount > itemCount) {
          return '🗑️';
        }
      }
      // New format (layoutUpdates) or no deletions detected: show as layout change
      return '🔄';
    }
    case 'BULK_ITEMS_CREATED':
      return '➕';

  }
}

function getEventDescription(event: WorkspaceEvent, items?: any[]): string {
  switch (event.type) {
    case 'ITEM_CREATED':
      return `Created ${event.payload.item.type}: "${event.payload.item.name}"`;
    case 'ITEM_UPDATED': {
      // Try to find the item title from the current items
      const item = items?.find(item => item.id === event.payload.id);
      const itemTitle = item?.name || `item ${event.payload.id}`;
      return `Updated "${itemTitle}"`;
    }
    case 'ITEM_DELETED': {
      // For deleted items, we can't look up the current title, so use ID
      return `Deleted item ${event.payload.id}`;
    }
    case 'GLOBAL_TITLE_SET':
      return `Set title to "${event.payload.title}"`;
    case 'GLOBAL_DESCRIPTION_SET':
      return `Set description to "${event.payload.description}"`;
    case 'BULK_ITEMS_UPDATED': {
      // Support both new format (layoutUpdates) and legacy format (items array)
      // For new format (layoutUpdates), we can't determine deletions from layout changes alone
      // Only check for deletions if we have the full items array (legacy format)
      if (event.payload.items) {
        // Legacy format: can check for deletions
        const itemCount = event.payload.items.length;
        const prevCount = event.payload.previousItemCount;
        if (prevCount !== undefined && prevCount > itemCount) {
          const deletedCount = prevCount - itemCount;
          return deletedCount === 1
            ? 'Deleted 1 card'
            : `Deleted ${deletedCount} cards`;
        }
        // Legacy format: show total items updated
        return `Updated ${itemCount} item${itemCount === 1 ? '' : 's'} (layout change)`;
      }
      // New format (layoutUpdates): show number of items whose layout changed
      const updateCount = event.payload.layoutUpdates?.length ?? 0;
      return `Updated ${updateCount} item${updateCount === 1 ? '' : 's'} (layout change)`;
    }
    case 'BULK_ITEMS_CREATED': {
      const itemCount = event.payload.items.length;
      if (itemCount === 1) {
        const item = event.payload.items[0];
        return `Created ${item.type}: "${item.name}"`;
      } else {
        // Group by type for more descriptive message
        const typeCounts = event.payload.items.reduce((acc, item) => {
          acc[item.type] = (acc[item.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>);

        const typeStrings = Object.entries(typeCounts).map(([type, count]) => {
          return count === 1 ? `1 ${type}` : `${count} ${type}s`;
        });

        if (typeStrings.length === 1) {
          return `Created ${itemCount} ${event.payload.items[0].type}${itemCount === 1 ? '' : 's'}`;
        } else {
          return `Created ${itemCount} cards (${typeStrings.join(', ')})`;
        }
      }
    }

    default:
      return event.type;
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;

  // Less than 1 minute
  if (diff < 60000) {
    return 'Just now';
  }

  // Less than 1 hour
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
  }

  // Less than 24 hours
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }

  // More than 24 hours - show date
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function VersionHistoryModal({
  isOpen,
  onClose,
  events,
  currentVersion,
  onRevertToVersion,
  items,
  workspaceId,
}: VersionHistoryModalProps) {
  const { data: session } = useSession();
  const user = session?.user;
  const [showNotSupportedDialog, setShowNotSupportedDialog] = useState(false);

  // Fetch all snapshots when modal is open (lazy loading for version history)
  const { data: snapshots = [], isLoading: isLoadingSnapshots } = useWorkspaceSnapshots(
    workspaceId,
    isOpen // Only fetch when modal is open
  );

  // Function to get display name - uses stored userName from event, or falls back to userId
  const getUserDisplayName = (event: WorkspaceEvent): string => {
    // If userName is stored in the event, use it
    if (event.userName) {
      // If it's the current user, you can optionally show "You" instead
      if (user?.id === event.userId) {
        return event.userName + ' (You)';
      }
      return event.userName;
    }

    // Fallback: If it's the current user and no userName stored, show their current name
    if (user?.id === event.userId) {
      return user?.name || user?.email || 'You';
    }

    // Fallback: For other users without userName, show truncated ID
    if (event.userId.startsWith('user_')) {
      return event.userId.slice(0, 15) + '...';
    }

    return event.userId;
  };

  // Reverse events so newest is first
  // Use the version from each event (from database)
  const reversedEvents = [...events]
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0));  // Sort by version descending

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent
          className="max-w-2xl max-h-[80vh] border-white/20 bg-black/40 backdrop-blur-2xl shadow-2xl"
          style={{
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Version History
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {snapshots.length > 0 && `${snapshots.length} snapshots • `}
                {events.length} recent {events.length === 1 ? 'event' : 'events'}
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="h-[500px] overflow-y-auto pr-4 space-y-6">
            {/* Snapshots Section */}
            {isLoadingSnapshots ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Snapshots
                </h3>
                <div className="text-sm text-muted-foreground">Loading snapshots...</div>
              </div>
            ) : snapshots.length > 0 ? (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Snapshots
                </h3>
                <div className="space-y-2">
                  {snapshots.map((snapshot, index) => (
                    <div
                      key={snapshot.id}
                      className={cn(
                        "group relative rounded-lg border p-4 transition-colors",
                        index === 0
                          ? "bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 ring-1 ring-blue-500/20"
                          : "border-border bg-accent/10 hover:bg-accent/20"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-2xl mt-0.5">📸</div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">
                              Snapshot v{snapshot.version}
                            </span>
                            {index === 0 && (
                              <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                                Latest
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatTime(new Date(snapshot.createdAt).getTime())}
                            </span>
                            <span>
                              {snapshot.eventCount} events captured
                            </span>
                          </div>
                        </div>

                        {index !== 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              setShowNotSupportedDialog(true);
                            }}
                          >
                            <Undo2 className="h-4 w-4 mr-1" />
                            Restore
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Recent Events Section */}
            <div className="space-y-2">
              {snapshots.length > 0 && (
                <h3 className="text-sm font-medium text-muted-foreground">
                  Recent Changes (since v{snapshots[0]?.version || 0})
                </h3>
              )}

              {reversedEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Clock className="h-12 w-12 mb-3 opacity-20" />
                  <p>No history yet</p>
                  <p className="text-sm">Events will appear as you make changes</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {reversedEvents.map((event) => {
                    const eventVersion = event.version ?? 0;

                    return (
                      <div
                        key={event.id}
                        className={cn(
                          "group relative rounded-lg border p-4 hover:bg-accent/50 transition-colors",
                          eventVersion === currentVersion && "bg-blue-500/10 border-blue-500/30 ring-1 ring-blue-500/20"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="text-2xl mt-0.5">{getEventIcon(event)}</div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">
                                {getEventDescription(event, items)}
                              </span>
                              {eventVersion === currentVersion && (
                                <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                                  Current
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {formatTime(event.timestamp)}
                              </span>
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {getUserDisplayName(event)}
                              </span>
                              <span className="text-muted-foreground/60">
                                v{eventVersion}
                              </span>
                            </div>
                          </div>

                          {eventVersion < currentVersion && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                setShowNotSupportedDialog(true);
                              }}
                            >
                              <Undo2 className="h-4 w-4 mr-1" />
                              Revert
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <RevertNotSupportedDialog
        isOpen={showNotSupportedDialog}
        onClose={() => setShowNotSupportedDialog(false)}
      />
    </>
  );
}

export function RevertNotSupportedDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const emailSubject = encodeURIComponent("Feature Request: Version History Revert");
  const emailBody = encodeURIComponent(`Hi,

I'm interested in version history revert functionality.

`);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Feature Not Available
          </DialogTitle>
          <DialogDescription asChild>
            <div className="pt-2 space-y-3">
              <p className="text-sm text-muted-foreground">
                Version history revert is currently under development.
              </p>
              <p className="text-sm text-muted-foreground">
                Interested in this feature? Let us know at{" "}
                <a
                  href={`mailto:support@thinkex.app?subject=${emailSubject}&body=${emailBody}`}
                  className="underline hover:text-amber-400 transition-colors text-amber-500"
                >
                  support@thinkex.app
                </a>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={onClose}
          >
            Close
          </Button>
          <Button
            onClick={() => {
              window.location.href = `mailto:support@thinkex.app?subject=${emailSubject}&body=${emailBody}`;
            }}
          >
            I'm interested
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

