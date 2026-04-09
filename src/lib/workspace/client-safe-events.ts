import type { Item } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "./events";

function stripOcrPagesFromItem(item: Item): void {
  if (
    (item.type === "pdf" || item.type === "image") &&
    item.data &&
    typeof item.data === "object"
  ) {
    const data = item.data as Record<string, unknown>;
    delete data.ocrPages;
  }
}

function stripPerUserStateFromItem(item: Item): void {
  if (!item.data || typeof item.data !== "object") {
    return;
  }

  const data = item.data as Record<string, unknown>;

  switch (item.type) {
    case "flashcard":
      delete data.currentIndex;
      break;
    case "quiz":
      delete data.session;
      break;
    case "youtube":
      delete data.progress;
      delete data.playbackRate;
      break;
    default:
      break;
  }
}

function stripPerUserStateFromItemChanges(
  changes: Record<string, unknown>,
): void {
  if (!changes.data || typeof changes.data !== "object") {
    return;
  }

  const data = changes.data as Record<string, unknown>;
  delete data.currentIndex;
  delete data.session;
  delete data.progress;
  delete data.playbackRate;
}

function stripClientUnsafeFieldsFromSnapshotPayload(
  payload: Item[] | { items?: Item[] },
): void {
  if (Array.isArray(payload)) {
    payload.forEach((item) => {
      stripOcrPagesFromItem(item);
      stripPerUserStateFromItem(item);
    });
    return;
  }

  payload.items?.forEach((item) => {
    stripOcrPagesFromItem(item);
    stripPerUserStateFromItem(item);
  });
}

export function sanitizeWorkspaceEventForClient(
  event: WorkspaceEvent,
): WorkspaceEvent {
  const sanitized = structuredClone(event);
  const payload = sanitized.payload as Record<string, unknown>;

  switch (sanitized.type) {
    case "WORKSPACE_SNAPSHOT":
      stripClientUnsafeFieldsFromSnapshotPayload(
        sanitized.payload as Item[] | { items?: Item[] },
      );
      break;
    case "ITEM_CREATED":
      if (payload.item) {
        stripOcrPagesFromItem(payload.item as Item);
        stripPerUserStateFromItem(payload.item as Item);
      }
      break;
    case "ITEM_UPDATED":
      if (payload.changes && typeof payload.changes === "object") {
        stripPerUserStateFromItemChanges(
          payload.changes as Record<string, unknown>,
        );
        const changes = payload.changes as Record<string, unknown>;
        if (changes.data && typeof changes.data === "object") {
          const data = changes.data as Record<string, unknown>;
          delete data.ocrPages;
        }
      }
      break;
    case "BULK_ITEMS_CREATED":
      (payload.items as Item[] | undefined)?.forEach((item) => {
        stripOcrPagesFromItem(item);
        stripPerUserStateFromItem(item);
      });
      break;
    case "BULK_ITEMS_PATCHED":
      (
        payload.updates as
          | Array<{ changes?: Record<string, unknown> }>
          | undefined
      )?.forEach((update) => {
        if (update.changes) {
          stripPerUserStateFromItemChanges(update.changes);
          const data = update.changes.data;
          if (data && typeof data === "object") {
            delete (data as Record<string, unknown>).ocrPages;
          }
        }
      });
      break;
    case "BULK_ITEMS_UPDATED":
      (payload.addedItems as Item[] | undefined)?.forEach((item) => {
        stripOcrPagesFromItem(item);
        stripPerUserStateFromItem(item);
      });
      (payload.items as Item[] | undefined)?.forEach((item) => {
        stripOcrPagesFromItem(item);
        stripPerUserStateFromItem(item);
      });
      break;
    default:
      break;
  }

  return sanitized;
}

export function sanitizeWorkspaceEventsForClient(
  events: WorkspaceEvent[],
): WorkspaceEvent[] {
  return events.map((event) => sanitizeWorkspaceEventForClient(event));
}
