"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useWorkspaceEvents } from "@/hooks/workspace/use-workspace-events";
import type { WorkspaceEventsRow } from "@/lib/zero/zero-schema.gen";

const PAGE_SIZE = 50;
const MAX_LIMIT = 500;

type DayBucket =
  | "today"
  | "yesterday"
  | "earlier_this_week"
  | "older";

const DAY_LABELS: Record<DayBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  earlier_this_week: "Earlier this week",
  older: "Older",
};

interface WorkspaceActivityPanelProps {
  workspaceId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WorkspaceActivityPanel({
  workspaceId,
  open,
  onOpenChange,
}: WorkspaceActivityPanelProps) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const { events, isLoading, error } = useWorkspaceEvents(
    open ? workspaceId : null,
    limit,
  );

  const grouped = useMemo(() => groupEventsByDay(events), [events]);

  const canLoadMore =
    events.length === limit && limit < MAX_LIMIT;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md flex flex-col gap-0">
        <SheetHeader>
          <SheetTitle>Activity</SheetTitle>
        </SheetHeader>
        <ScrollArea className="flex-1 px-4 pb-4">
          {error ? (
            <div className="py-8 text-sm text-red-500">
              Could not load activity: {error.message}
            </div>
          ) : isLoading && events.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">Loading…</div>
          ) : events.length === 0 ? (
            <div className="py-8 text-sm text-muted-foreground">
              No activity yet
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {(Object.keys(DAY_LABELS) as DayBucket[]).map((bucket) => {
                const items = grouped[bucket];
                if (items.length === 0) return null;
                return (
                  <section key={bucket} className="flex flex-col gap-2">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {DAY_LABELS[bucket]}
                    </h3>
                    <ul className="flex flex-col gap-3">
                      {items.map((event) => (
                        <ActivityRow key={event.id} event={event} />
                      ))}
                    </ul>
                  </section>
                );
              })}
              {canLoadMore && (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setLimit((current) =>
                        Math.min(current + PAGE_SIZE, MAX_LIMIT),
                      )
                    }
                  >
                    Load older
                  </Button>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function ActivityRow({ event }: { event: WorkspaceEventsRow }) {
  const { actor, verbHtml } = renderEventPhrase(event);
  const ts = formatRelativeTimestamp(event.updatedAt ?? event.createdAt ?? null);
  return (
    <li className="flex items-start gap-3">
      <Avatar className="size-8 shrink-0">
        {event.actorImage ? (
          <AvatarImage src={event.actorImage} alt={actor} />
        ) : null}
        <AvatarFallback className="text-xs">
          {actor.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="text-sm leading-tight">
          <span className="font-medium text-foreground">{actor}</span>{" "}
          <span className="text-muted-foreground">{verbHtml}</span>
        </div>
        <div className="text-xs text-muted-foreground">{ts}</div>
      </div>
    </li>
  );
}

function renderEventPhrase(event: WorkspaceEventsRow): {
  actor: string;
  verbHtml: React.ReactNode;
} {
  const actor = event.actorName ?? "Someone";
  const itemName = event.itemName ?? "an item";
  const summary = (event.summary ?? {}) as Record<string, unknown>;
  const editSuffix = event.editCount > 1 ? ` (${event.editCount} edits)` : "";

  switch (event.action) {
    case "item_created": {
      const itemType =
        typeof summary.itemType === "string"
          ? summary.itemType
          : (event.itemType ?? "item");
      return {
        actor,
        verbHtml: (
          <>
            created {itemType} <em>{itemName}</em>
          </>
        ),
      };
    }
    case "item_renamed": {
      const from = typeof summary.from === "string" ? summary.from : "";
      const to = typeof summary.to === "string" ? summary.to : itemName;
      return {
        actor,
        verbHtml: (
          <>
            renamed <em>{from}</em> → <em>{to}</em>
          </>
        ),
      };
    }
    case "item_updated":
      return {
        actor,
        verbHtml: (
          <>
            edited <em>{itemName}</em>
            {editSuffix}
          </>
        ),
      };
    case "item_deleted":
      return {
        actor,
        verbHtml: (
          <>
            deleted <em>{itemName}</em>
          </>
        ),
      };
    case "item_moved": {
      const toName =
        typeof summary.toFolderName === "string" ? summary.toFolderName : null;
      return {
        actor,
        verbHtml: toName ? (
          <>
            moved <em>{itemName}</em> into <em>{toName}</em>
          </>
        ) : (
          <>
            moved <em>{itemName}</em> out of folder
          </>
        ),
      };
    }
    case "folder_created": {
      const count =
        typeof summary.initialItemCount === "number"
          ? summary.initialItemCount
          : 0;
      return {
        actor,
        verbHtml:
          count > 0 ? (
            <>
              created folder <em>{itemName}</em> with {count} item
              {count === 1 ? "" : "s"}
            </>
          ) : (
            <>
              created folder <em>{itemName}</em>
            </>
          ),
      };
    }
    default:
      return {
        actor,
        verbHtml: (
          <>
            did something to <em>{itemName}</em>
          </>
        ),
      };
  }
}

function formatRelativeTimestamp(value: number | string | null): string {
  if (value === null) return "";
  const ts =
    typeof value === "number"
      ? value
      : Number.isFinite(Date.parse(value))
        ? Date.parse(value)
        : null;
  if (ts === null) return "";

  const now = Date.now();
  const diffMs = now - ts;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const date = new Date(ts);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // If the event is today, show hours ago
  if (date >= startOfToday) {
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  }

  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (date >= startOfYesterday) return "yesterday";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function groupEventsByDay(
  events: readonly WorkspaceEventsRow[],
): Record<DayBucket, WorkspaceEventsRow[]> {
  const groups: Record<DayBucket, WorkspaceEventsRow[]> = {
    today: [],
    yesterday: [],
    earlier_this_week: [],
    older: [],
  };

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  // 7-day rolling window for "earlier this week"
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  for (const event of events) {
    const tsValue = event.updatedAt ?? event.createdAt;
    const ts =
      typeof tsValue === "number"
        ? tsValue
        : tsValue && Number.isFinite(Date.parse(tsValue))
          ? Date.parse(tsValue)
          : null;
    if (ts === null) {
      groups.older.push(event);
      continue;
    }
    const date = new Date(ts);
    if (date >= startOfToday) groups.today.push(event);
    else if (date >= startOfYesterday) groups.yesterday.push(event);
    else if (date >= startOfWeek) groups.earlier_this_week.push(event);
    else groups.older.push(event);
  }

  return groups;
}
