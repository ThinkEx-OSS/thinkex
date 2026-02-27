"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Clock, User, Undo2, Calendar, Camera, FolderPlus, Plus, Pencil, Trash2, RefreshCw, Folder, FolderInput } from "lucide-react";
import { CgNotes } from "react-icons/cg";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";


function getEventIcon(event: WorkspaceEvent) {
  const iconClass = "h-6 w-6 shrink-0";
  switch (event.type) {
    case 'WORKSPACE_CREATED':
      return <FolderPlus className={`${iconClass} text-amber-500`} />;
    case 'ITEM_CREATED':
      return <Plus className={`${iconClass} text-emerald-500`} />;
    case 'ITEM_UPDATED':
      return <Pencil className={`${iconClass} text-amber-500`} />;
    case 'ITEM_DELETED':
      return <Trash2 className={`${iconClass} text-red-500`} />;
    case 'GLOBAL_TITLE_SET':
    case 'GLOBAL_DESCRIPTION_SET':
      return <CgNotes className={`${iconClass} text-blue-500`} />;
    case 'BULK_ITEMS_UPDATED': {
      if (event.payload.items) {
        const itemCount = event.payload.items.length;
        const prevCount = event.payload.previousItemCount;
        if (prevCount !== undefined && prevCount > itemCount) {
          return <Trash2 className={`${iconClass} text-red-500`} />;
        }
      }
      return <RefreshCw className={`${iconClass} text-slate-500`} />;
    }
    case 'BULK_ITEMS_CREATED':
      return <Plus className={`${iconClass} text-emerald-500`} />;
    case 'WORKSPACE_SNAPSHOT':
      return <Camera className={`${iconClass} text-slate-500`} />;
    case 'FOLDER_CREATED':
      return <FolderPlus className={`${iconClass} text-amber-500`} />;
    case 'FOLDER_UPDATED':
      return <Pencil className={`${iconClass} text-amber-500`} />;
    case 'FOLDER_DELETED':
      return <Trash2 className={`${iconClass} text-red-500`} />;
    case 'ITEM_MOVED_TO_FOLDER':
    case 'ITEMS_MOVED_TO_FOLDER':
      return <FolderInput className={`${iconClass} text-slate-500`} />;
    case 'FOLDER_CREATED_WITH_ITEMS':
      return <Folder className={`${iconClass} text-amber-500`} />;
    default:
      return <CgNotes className={`${iconClass} text-muted-foreground`} />;
  }
}

function getEventDescription(event: WorkspaceEvent, items?: any[]): string {
  switch (event.type) {
    case 'WORKSPACE_CREATED': {
      const title = event.payload.title?.trim();
      return title ? `Created workspace "${title}"` : 'Workspace created';
    }
    case 'ITEM_CREATED':
      return `Created ${event.payload.item.type}: "${event.payload.item.name}"`;
    case 'ITEM_UPDATED': {
      // Prefer name stored in event payload, then lookup from items
      const itemTitle = event.payload.name ?? items?.find(item => item.id === event.payload.id)?.name ?? `item ${event.payload.id}`;
      return `Updated "${itemTitle}"`;
    }
    case 'ITEM_DELETED': {
      // Prefer name stored in event payload (included when event was created)
      const itemTitle = event.payload.name ?? `item ${event.payload.id}`;
      return `Deleted "${itemTitle}"`;
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
    case 'WORKSPACE_SNAPSHOT':
      return 'Saved workspace snapshot';
    case 'FOLDER_CREATED': {
      const name = event.payload.folder?.name;
      return name ? `Created folder "${name}"` : 'Created folder';
    }
    case 'FOLDER_UPDATED': {
      const name = event.payload.name ?? items?.find(item => item.id === event.payload.id)?.name;
      return name ? `Updated folder "${name}"` : 'Updated folder';
    }
    case 'FOLDER_DELETED': {
      const name = event.payload.name ?? items?.find(item => item.id === event.payload.id)?.name;
      return name ? `Deleted folder "${name}"` : 'Deleted folder';
    }
    case 'ITEM_MOVED_TO_FOLDER': {
      const n = event.payload.folderId ? 'moved into folder' : 'removed from folder';
      const name = event.payload.itemName ?? items?.find(item => item.id === event.payload.itemId)?.name;
      return name ? `"${name}" ${n}` : `Item ${n}`;
    }
    case 'ITEMS_MOVED_TO_FOLDER': {
      const count = event.payload.itemIds?.length ?? 0;
      const n = event.payload.folderId ? 'moved into folder' : 'removed from folder';
      if (count === 0) return `No items ${n}`;
      const names = event.payload.itemNames?.filter(Boolean);
      if (count === 1 && names?.[0]) return `"${names[0]}" ${n}`;
      if (count === 1) return `Item ${n}`;
      return `${count} items ${n}`;
    }
    case 'FOLDER_CREATED_WITH_ITEMS': {
      const name = event.payload.folder?.name;
      const count = event.payload.itemIds?.length ?? 0;
      if (name && count > 0) return `Created folder "${name}" with ${count} item${count === 1 ? '' : 's'}`;
      if (name) return `Created folder "${name}"`;
      return count > 0 ? `Created folder with ${count} item${count === 1 ? '' : 's'}` : 'Created folder';
    }
    default:
      return 'Unknown event';
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

// Reusable version history content component
interface VersionHistoryContentProps {
  events: WorkspaceEvent[];
  currentVersion: number;
  onRevertToVersion: (version: number) => Promise<void>;
  onClose?: () => void;
  items?: any[];
}

export function VersionHistoryContent({
  events,
  currentVersion,
  onRevertToVersion,
  onClose,
  items,
}: VersionHistoryContentProps) {
  const { data: session } = useSession();
  const user = session?.user;
  const [confirmingVersion, setConfirmingVersion] = useState<number | null>(null);
  const [isReverting, setIsReverting] = useState(false);

  const handleRevert = async (eventVersion: number) => {
    // Revert TO the state before this event (undo the event they clicked on)
    const targetVersion = eventVersion - 1;
    if (targetVersion < 1) return; // WORKSPACE_CREATED is v1, can't go before it
    setIsReverting(true);
    try {
      await onRevertToVersion(targetVersion);
      setConfirmingVersion(null);
      onClose?.();
    } catch {
      // toast is handled by the hook
    } finally {
      setIsReverting(false);
    }
  };

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
      <div className="space-y-2">
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

                const isWorkspaceCreated = event.type === 'WORKSPACE_CREATED';

                return (
                  <div
                    key={event.id}
                    className={cn(
                      "group relative rounded-lg border p-4 hover:bg-accent/50 transition-colors",
                      eventVersion === currentVersion && "bg-blue-500/10 border-blue-500/30 ring-1 ring-blue-500/20",
                      isWorkspaceCreated && "bg-amber-500/5 border-amber-500/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex items-center justify-center w-8 shrink-0">
                        {getEventIcon(event)}
                      </div>

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

                      {eventVersion > 1 && !isWorkspaceCreated && (
                        confirmingVersion === eventVersion ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={isReverting}
                              onClick={() => handleRevert(eventVersion)}
                            >
                              {isReverting ? "Reverting..." : "Revert"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={isReverting}
                              onClick={() => setConfirmingVersion(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setConfirmingVersion(eventVersion)}
                          >
                            <Undo2 className="h-4 w-4 mr-1" />
                            Revert
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </>
  );
}

