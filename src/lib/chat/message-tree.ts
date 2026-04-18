import type { ThinkexUIMessage } from "./types";

export function sortParentsBeforeChildren<
  T extends { parentId: string | null; message: { id: string } }
>(items: T[], getCreatedAt: (item: T) => string): T[] {
  const output: T[] = [];
  const added = new Set<string>();
  const allIds = new Set(items.map((item) => item.message.id));
  const compareItems = (a: T, b: T) => {
    const tA = new Date(getCreatedAt(a)).getTime();
    const tB = new Date(getCreatedAt(b)).getTime();
    return tA - tB || a.message.id.localeCompare(b.message.id);
  };

  const getReady = () =>
    items.filter(
      (m) =>
        !added.has(m.message.id) &&
        (
          m.parentId === null ||
          added.has(m.parentId) ||
          !allIds.has(m.parentId) ||
          m.parentId === m.message.id
        )
    );

  while (output.length < items.length) {
    const ready = getReady();
    if (ready.length === 0) {
      const next = items
        .filter((m) => !added.has(m.message.id))
        .sort(compareItems)[0];
      if (!next) break;
      output.push(next);
      added.add(next.message.id);
      continue;
    }
    ready.sort(compareItems);
    const next = ready[0]!;
    output.push(next);
    added.add(next.message.id);
  }

  return output;
}

export function buildChildrenMap(
  parentMap: Map<string, string | null>
): Map<string | null, string[]> {
  const childrenMap = new Map<string | null, string[]>();

  for (const [messageId, parentId] of parentMap) {
    const siblings = childrenMap.get(parentId);
    if (siblings) {
      siblings.push(messageId);
      continue;
    }
    childrenMap.set(parentId, [messageId]);
  }

  return childrenMap;
}

export function getHeadPath(
  messagesById: Map<string, ThinkexUIMessage>,
  parentMap: Map<string, string | null>,
  childrenMap: Map<string | null, string[]>,
  headId: string | null,
  branchIndexByParentId: Record<string, number>
): ThinkexUIMessage[] {
  void branchIndexByParentId;

  const resolvedHeadId =
    headId ??
    getLatestLeafId(
      Array.from(messagesById.values()).map((message) => ({
        id: message.id,
        created_at:
          typeof message.metadata?.createdAt === "number"
            ? new Date(message.metadata.createdAt).toISOString()
            : undefined,
      })),
      childrenMap
    );

  if (!resolvedHeadId) return [];

  const pathIds: string[] = [];
  let currentId: string | null | undefined = resolvedHeadId;

  while (currentId != null) {
    pathIds.push(currentId);
    currentId = parentMap.get(currentId);
  }

  return pathIds
    .reverse()
    .map((messageId) => messagesById.get(messageId))
    .filter((message): message is ThinkexUIMessage => message !== undefined);
}

export function getSiblings(
  parentMap: Map<string, string | null>,
  childrenMap: Map<string | null, string[]>,
  messageId: string
): string[] {
  if (!parentMap.has(messageId)) return [messageId];
  const parentId = parentMap.get(messageId) ?? null;
  return childrenMap.get(parentId) ?? [messageId];
}

export function getLatestLeafId(
  messages: Array<{ id: string; created_at?: string }>,
  childrenMap: Map<string | null, string[]>
): string | null {
  let latestLeaf: { id: string; created_at?: string } | null = null;

  for (const message of messages) {
    const children = childrenMap.get(message.id);
    const isLeaf = children == null || children.length === 0;
    if (!isLeaf) continue;

    if (!latestLeaf) {
      latestLeaf = message;
      continue;
    }

    const createdAt = message.created_at ?? "";
    const latestCreatedAt = latestLeaf.created_at ?? "";
    if (createdAt > latestCreatedAt) {
      latestLeaf = message;
      continue;
    }
    if (createdAt === latestCreatedAt && message.id.localeCompare(latestLeaf.id) > 0) {
      latestLeaf = message;
    }
  }

  return latestLeaf?.id ?? null;
}
