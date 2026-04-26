import { describe, expect, it } from "vitest";
import { user, workspaceEvents } from "@/lib/db/schema";
import {
  mergeSummary,
  recordEvent,
  type RecordEventInput,
  type WorkspaceEventAction,
} from "../events";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-1";
const COALESCE_WINDOW_MS = 5 * 60 * 1000;

interface FakeEventRow {
  id: string;
  workspaceId: string;
  userId: string;
  actorName: string | null;
  actorImage: string | null;
  itemId: string | null;
  itemType: string | null;
  itemName: string | null;
  action: string;
  summary: Record<string, unknown>;
  editCount: number;
  createdAt: string;
  updatedAt: string;
}

interface FakeUserRow {
  id: string;
  name: string | null;
  image: string | null;
}

interface FakeState {
  events: FakeEventRow[];
  users: Map<string, FakeUserRow>;
  nextEventId: number;
}

function createState(): FakeState {
  return {
    events: [],
    users: new Map(),
    nextEventId: 1,
  };
}

/**
 * Builds a wrapped-tx mock that drives all queries from the active
 * `recordEvent` input rather than parsing Drizzle SQL chunks. recordEvent
 * issues only:
 *   - `select().from(workspaceEvents).where(<exact filter>).orderBy(...).limit(1)`
 *   - `update(workspaceEvents).set(...).where(eq(id, recent.id))`
 *   - `select({name,image}).from(user).where(eq(user.id, userId)).limit(1)`
 *   - `insert(workspaceEvents).values(row)`
 *
 * So the mock can compute the matching set from the captured input directly.
 */
function createWrappedTx(
  state: FakeState,
  getInput: () => RecordEventInput | null,
) {
  function findCoalesceCandidate(): FakeEventRow | null {
    const inp = getInput();
    if (!inp) return null;
    const fiveMinAgoIso = new Date(
      Date.now() - COALESCE_WINDOW_MS,
    ).toISOString();
    const matched = state.events.filter(
      (e) =>
        e.workspaceId === inp.workspaceId &&
        e.userId === inp.userId &&
        e.itemId === inp.itemId &&
        e.action === inp.action &&
        e.updatedAt >= fiveMinAgoIso,
    );
    matched.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    return matched[0] ?? null;
  }

  return {
    select(_selection?: unknown) {
      return {
        from(table: unknown) {
          if (table === workspaceEvents) {
            return {
              where(_cond: unknown) {
                return {
                  orderBy(_sort: unknown) {
                    return {
                      limit: async (_count: number) => {
                        const recent = findCoalesceCandidate();
                        return recent ? [{ ...recent }] : [];
                      },
                    };
                  },
                };
              },
            };
          }

          if (table === user) {
            return {
              where(_cond: unknown) {
                return {
                  limit: async (_count: number) => {
                    const inp = getInput();
                    if (!inp) return [];
                    const u = state.users.get(inp.userId);
                    return u ? [{ name: u.name, image: u.image }] : [];
                  },
                };
              },
            };
          }

          throw new Error(`Unsupported select.from table`);
        },
      };
    },
    update(_table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where: async (_cond: unknown) => {
              const recent = findCoalesceCandidate();
              if (!recent) return;
              const idx = state.events.findIndex((e) => e.id === recent.id);
              if (idx < 0) return;
              state.events[idx] = {
                ...state.events[idx],
                ...(values as Partial<FakeEventRow>),
              };
            },
          };
        },
      };
    },
    insert(_table: unknown) {
      return {
        values: async (row: Record<string, unknown>) => {
          state.events.push({
            id: `evt-${state.nextEventId++}`,
            workspaceId: row.workspaceId as string,
            userId: row.userId as string,
            actorName: (row.actorName as string | null) ?? null,
            actorImage: (row.actorImage as string | null) ?? null,
            itemId: (row.itemId as string | null) ?? null,
            itemType: (row.itemType as string | null) ?? null,
            itemName: (row.itemName as string | null) ?? null,
            action: row.action as string,
            summary: (row.summary as Record<string, unknown>) ?? {},
            editCount: (row.editCount as number) ?? 1,
            createdAt: row.createdAt as string,
            updatedAt: row.updatedAt as string,
          });
        },
      };
    },
  };
}

async function record(
  state: FakeState,
  input: Partial<RecordEventInput> & { action: WorkspaceEventAction },
) {
  const fullInput: RecordEventInput = {
    workspaceId: WORKSPACE_ID,
    userId: USER_ID,
    itemId: "item-1",
    itemType: "document",
    itemName: "Doc",
    summary: {},
    ...input,
  };
  let active: RecordEventInput | null = fullInput;
  const tx = createWrappedTx(state, () => active);
  try {
    await recordEvent(tx as never, fullInput);
  } finally {
    active = null;
  }
}

describe("recordEvent", () => {
  it("inserts a fresh row when no recent event exists", async () => {
    const state = createState();
    state.users.set(USER_ID, { id: USER_ID, name: "Alice", image: "http://a" });

    await record(state, {
      action: "item_updated",
      summary: { fields: ["data"] },
    });

    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      userId: USER_ID,
      itemId: "item-1",
      action: "item_updated",
      editCount: 1,
      actorName: "Alice",
      actorImage: "http://a",
      summary: { fields: ["data"] },
    });
  });

  it("coalesces a second item_updated from same user/item within window", async () => {
    const state = createState();
    state.users.set(USER_ID, { id: USER_ID, name: "Alice", image: null });

    await record(state, {
      action: "item_updated",
      summary: { fields: ["data"] },
    });
    await record(state, {
      action: "item_updated",
      summary: { fields: ["subtitle"] },
    });

    expect(state.events).toHaveLength(1);
    expect(state.events[0].editCount).toBe(2);
    const fields = state.events[0].summary.fields as string[];
    expect(new Set(fields)).toEqual(new Set(["data", "subtitle"]));
  });

  it("does NOT coalesce when action differs", async () => {
    const state = createState();
    state.users.set(USER_ID, { id: USER_ID, name: "Alice", image: null });

    await record(state, {
      action: "item_updated",
      summary: { fields: ["data"] },
    });
    await record(state, {
      action: "item_renamed",
      summary: { from: "Doc", to: "Doc 2" },
    });

    expect(state.events).toHaveLength(2);
    expect(state.events[0].action).toBe("item_updated");
    expect(state.events[1].action).toBe("item_renamed");
  });

  it("does NOT coalesce when user differs", async () => {
    const state = createState();
    state.users.set(USER_ID, { id: USER_ID, name: "Alice", image: null });
    state.users.set("user-2", { id: "user-2", name: "Bob", image: null });

    await record(state, {
      action: "item_updated",
      summary: { fields: ["data"] },
    });
    await record(state, {
      userId: "user-2",
      action: "item_updated",
      summary: { fields: ["data"] },
    });

    expect(state.events).toHaveLength(2);
    expect(state.events[0].userId).toBe(USER_ID);
    expect(state.events[1].userId).toBe("user-2");
  });

  it("does NOT coalesce after the 5-min window", async () => {
    const state = createState();
    state.users.set(USER_ID, { id: USER_ID, name: "Alice", image: null });

    await record(state, {
      action: "item_updated",
      summary: { fields: ["data"] },
    });
    state.events[0].updatedAt = new Date(
      Date.now() - 10 * 60 * 1000,
    ).toISOString();

    await record(state, {
      action: "item_updated",
      summary: { fields: ["subtitle"] },
    });

    expect(state.events).toHaveLength(2);
  });

  it("does NOT coalesce item_created / item_deleted / folder_created", async () => {
    for (const action of [
      "item_created",
      "item_deleted",
      "folder_created",
    ] as const) {
      const state = createState();
      state.users.set(USER_ID, { id: USER_ID, name: "Alice", image: null });

      await record(state, { action, summary: {} });
      await record(state, { action, summary: {} });

      expect(state.events).toHaveLength(2);
    }
  });

  it("snapshots actor_name and actor_image from user table on insert", async () => {
    const state = createState();
    state.users.set(USER_ID, {
      id: USER_ID,
      name: "Carol",
      image: "http://carol.png",
    });

    await record(state, { action: "item_created", summary: {} });

    expect(state.events[0].actorName).toBe("Carol");
    expect(state.events[0].actorImage).toBe("http://carol.png");
  });

  it("falls back to null actor when user lookup misses", async () => {
    const state = createState();
    // No user seeded → lookup returns []

    await record(state, { action: "item_created", summary: {} });

    expect(state.events).toHaveLength(1);
    expect(state.events[0].actorName).toBeNull();
    expect(state.events[0].actorImage).toBeNull();
  });
});

describe("mergeSummary", () => {
  it("for item_renamed keeps original from, advances to", () => {
    const merged = mergeSummary(
      { from: "First", to: "Second" },
      { from: "Second", to: "Third" },
      "item_renamed",
    );
    expect(merged).toEqual({ from: "First", to: "Third" });
  });

  it("for item_updated unions field arrays", () => {
    const merged = mergeSummary(
      { fields: ["data"] },
      { fields: ["subtitle", "data"] },
      "item_updated",
    );
    expect(new Set(merged.fields as string[])).toEqual(
      new Set(["data", "subtitle"]),
    );
  });

  it("for item_moved keeps original fromFolder, advances toFolder", () => {
    const merged = mergeSummary(
      {
        fromFolderId: "f1",
        fromFolderName: "F1",
        toFolderId: "f2",
        toFolderName: "F2",
      },
      {
        fromFolderId: "f2",
        fromFolderName: "F2",
        toFolderId: "f3",
        toFolderName: "F3",
      },
      "item_moved",
    );
    expect(merged).toEqual({
      fromFolderId: "f1",
      fromFolderName: "F1",
      toFolderId: "f3",
      toFolderName: "F3",
    });
  });
});
