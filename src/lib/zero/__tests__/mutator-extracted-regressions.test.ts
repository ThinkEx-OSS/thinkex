import { describe, expect, it, vi } from "vitest";
import {
  workspaceCollaborators,
  workspaceItemContent,
  workspaceItemExtracted,
  workspaceItems,
  workspaces,
} from "@/lib/db/schema";
import type { Item } from "@/lib/workspace-state/types";
import { buildWorkspaceItemTableRows } from "@/lib/workspace/workspace-item-model";
import { upsertItem, mutators } from "../mutators";
import { serverMutators, syncExtractedRow } from "../server-mutators";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "user-1";
const NOW_ISO = "2026-04-22T00:00:00.000Z";

type ShellRow = ReturnType<typeof buildWorkspaceItemTableRows>["item"] & {
  createdAt: string;
  updatedAt: string;
};
type ContentRow = ReturnType<typeof buildWorkspaceItemTableRows>["content"] & {
  updatedAt: string;
};
type ExtractedRow = ReturnType<
  typeof buildWorkspaceItemTableRows
>["extracted"] & {
  updatedAt: string;
};

type FakeState = {
  workspaceOwners: Map<string, string>;
  collaboratorPermissions: Map<string, string>;
  shells: Map<string, ShellRow>;
  contents: Map<string, ContentRow>;
  extracteds: Map<string, ExtractedRow>;
};

function itemKey(workspaceId: string, itemId: string) {
  return `${workspaceId}:${itemId}`;
}

function collaboratorKey(workspaceId: string, userId: string) {
  return `${workspaceId}:${userId}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function seedItem(
  state: FakeState,
  item: Item,
  options?: { sourceVersion?: number },
) {
  const rows = buildWorkspaceItemTableRows({
    workspaceId: WORKSPACE_ID,
    item,
    sourceVersion: options?.sourceVersion ?? 1,
  });
  const key = itemKey(WORKSPACE_ID, item.id);

  state.shells.set(key, {
    ...rows.item,
    createdAt: NOW_ISO,
    updatedAt: NOW_ISO,
  });
  state.contents.set(key, {
    ...rows.content,
    updatedAt: NOW_ISO,
  });
  state.extracteds.set(key, {
    ...rows.extracted,
    updatedAt: NOW_ISO,
  });
}

function createState(): FakeState {
  return {
    workspaceOwners: new Map([[WORKSPACE_ID, USER_ID]]),
    collaboratorPermissions: new Map(),
    shells: new Map(),
    contents: new Map(),
    extracteds: new Map(),
  };
}

function createWrappedTx(
  state: FakeState,
  target: { workspaceId: string; itemId: string },
) {
  return {
    select(_selection?: unknown) {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                limit: async (_count: number) => {
                  if (table === workspaces) {
                    const ownerId = state.workspaceOwners.get(
                      target.workspaceId,
                    );
                    return ownerId ? [{ ownerId }] : [];
                  }

                  if (table === workspaceCollaborators) {
                    const permissionLevel = state.collaboratorPermissions.get(
                      collaboratorKey(target.workspaceId, USER_ID),
                    );
                    return permissionLevel ? [{ permissionLevel }] : [];
                  }

                  const key = itemKey(target.workspaceId, target.itemId);

                  if (table === workspaceItems) {
                    const row = state.shells.get(key);
                    return row ? [clone(row)] : [];
                  }

                  if (table === workspaceItemContent) {
                    const row = state.contents.get(key);
                    return row ? [clone(row)] : [];
                  }

                  if (table === workspaceItemExtracted) {
                    const row = state.extracteds.get(key);
                    return row ? [clone(row)] : [];
                  }

                  return [];
                },
              };
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where: async () => {
              if (table !== workspaceItems) {
                throw new Error("Unsupported update table");
              }

              const key = itemKey(target.workspaceId, target.itemId);
              const existing = state.shells.get(key);
              if (!existing) {
                return;
              }

              state.shells.set(key, {
                ...existing,
                ...values,
                updatedAt: NOW_ISO,
              });
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          return {
            onConflictDoUpdate: async ({
              set,
            }: {
              set: Record<string, unknown>;
            }) => {
              if (table !== workspaceItemExtracted) {
                throw new Error("Unsupported insert table");
              }

              const key = itemKey(
                values.workspaceId as string,
                values.itemId as string,
              );
              const existing = state.extracteds.get(key);

              state.extracteds.set(key, {
                ...(existing ?? {
                  workspaceId: values.workspaceId as string,
                  itemId: values.itemId as string,
                }),
                ...(values as ExtractedRow),
                ...(set as Partial<ExtractedRow>),
                updatedAt: NOW_ISO,
              } as ExtractedRow);
            },
          };
        },
      };
    },
    delete(table: unknown) {
      return {
        where: async () => {
          if (table !== workspaceItemExtracted) {
            throw new Error("Unsupported delete table");
          }

          state.extracteds.delete(itemKey(target.workspaceId, target.itemId));
        },
      };
    },
  };
}

function createMutateApi(state: FakeState) {
  return {
    workspace_items: {
      insert: vi.fn(async (row: Record<string, unknown>) => {
        const key = itemKey(row.workspaceId as string, row.itemId as string);
        state.shells.set(key, {
          ...(row as ShellRow),
          createdAt: NOW_ISO,
          updatedAt: NOW_ISO,
        });
      }),
      update: vi.fn(async (row: Record<string, unknown>) => {
        const key = itemKey(row.workspaceId as string, row.itemId as string);
        const existing = state.shells.get(key);
        if (!existing) {
          throw new Error(`Missing shell row for ${key}`);
        }

        state.shells.set(key, {
          ...existing,
          ...row,
          updatedAt: NOW_ISO,
        });
      }),
      delete: vi.fn(async (row: { workspaceId: string; itemId: string }) => {
        state.shells.delete(itemKey(row.workspaceId, row.itemId));
      }),
    },
    workspace_item_content: {
      insert: vi.fn(async (row: Record<string, unknown>) => {
        const key = itemKey(row.workspaceId as string, row.itemId as string);
        state.contents.set(key, {
          ...(row as ContentRow),
          updatedAt: NOW_ISO,
        });
      }),
      upsert: vi.fn(async (row: Record<string, unknown>) => {
        const key = itemKey(row.workspaceId as string, row.itemId as string);
        const existing = state.contents.get(key);
        state.contents.set(key, {
          ...(existing ?? {}),
          ...(row as ContentRow),
          updatedAt: NOW_ISO,
        } as ContentRow);
      }),
      delete: vi.fn(async (row: { workspaceId: string; itemId: string }) => {
        state.contents.delete(itemKey(row.workspaceId, row.itemId));
      }),
    },
  };
}

function createServerTx(
  state: FakeState,
  options: {
    workspaceId: string;
    itemId: string;
    runQueue?: unknown[];
  },
) {
  const wrappedTransaction = createWrappedTx(state, {
    workspaceId: options.workspaceId,
    itemId: options.itemId,
  });
  const runQueue = [...(options.runQueue ?? [])];

  return {
    location: "server" as const,
    dbTransaction: {
      wrappedTransaction,
    },
    run: vi.fn(async () => runQueue.shift() ?? null),
    mutate: createMutateApi(state),
  };
}

function createZeroTx(state: FakeState) {
  return {
    mutate: createMutateApi(state),
    run: vi.fn(async () => null),
  };
}

describe("zero mutator extracted-data regressions", () => {
  it("PDF rename preserves OCR pages", async () => {
    const state = createState();
    const pdf: Item = {
      id: "pdf-1",
      type: "pdf",
      name: "Original PDF",
      subtitle: "",
      data: {
        fileUrl: "https://example.com/file.pdf",
        filename: "file.pdf",
        ocrStatus: "complete",
        ocrPages: [{ index: 0, markdown: "Page body" }],
      },
    };
    seedItem(state, pdf);

    const key = itemKey(WORKSPACE_ID, pdf.id);
    const originalShell = clone(state.shells.get(key)!);
    const originalContent = clone(state.contents.get(key)!);
    const tx = createServerTx(state, {
      workspaceId: WORKSPACE_ID,
      itemId: pdf.id,
      runQueue: [originalShell, originalContent],
    });

    await serverMutators.item.update.fn({
      tx: tx as never,
      ctx: { userId: USER_ID },
      args: {
        workspaceId: WORKSPACE_ID,
        id: pdf.id,
        changes: { name: "Renamed PDF" },
      },
    });

    expect(state.extracteds.get(key)?.ocrPages).toEqual([
      { index: 0, markdown: "Page body" },
    ]);
    expect(state.shells.get(key)?.hasOcr).toBe(true);
    expect(state.shells.get(key)?.ocrPageCount).toBe(1);
  });

  it("Audio rename preserves transcript", async () => {
    const state = createState();
    const audio: Item = {
      id: "audio-1",
      type: "audio",
      name: "Lecture",
      subtitle: "",
      data: {
        fileUrl: "https://example.com/audio.mp3",
        filename: "audio.mp3",
        processingStatus: "complete",
        transcript: "Hello world",
        segments: [
          {
            speaker: "Speaker 1",
            timestamp: "00:00",
            content: "Hello world",
          },
        ],
      },
    };
    seedItem(state, audio);

    const key = itemKey(WORKSPACE_ID, audio.id);
    const tx = createServerTx(state, {
      workspaceId: WORKSPACE_ID,
      itemId: audio.id,
      runQueue: [
        clone(state.shells.get(key)!),
        clone(state.contents.get(key)!),
      ],
    });

    await serverMutators.item.update.fn({
      tx: tx as never,
      ctx: { userId: USER_ID },
      args: {
        workspaceId: WORKSPACE_ID,
        id: audio.id,
        changes: { name: "Renamed Lecture" },
      },
    });

    expect(state.extracteds.get(key)?.transcriptText).toBe("Hello world");
    expect(state.extracteds.get(key)?.transcriptSegments).toEqual([
      {
        speaker: "Speaker 1",
        timestamp: "00:00",
        content: "Hello world",
      },
    ]);
    expect(state.shells.get(key)?.hasTranscript).toBe(true);
  });

  it("Image rename preserves OCR pages", async () => {
    const state = createState();
    const image: Item = {
      id: "image-1",
      type: "image",
      name: "Board photo",
      subtitle: "",
      data: {
        url: "https://example.com/image.png",
        ocrStatus: "complete",
        ocrPages: [{ index: 0, markdown: "Caption text" }],
      },
    };
    seedItem(state, image);

    const key = itemKey(WORKSPACE_ID, image.id);
    const tx = createServerTx(state, {
      workspaceId: WORKSPACE_ID,
      itemId: image.id,
      runQueue: [
        clone(state.shells.get(key)!),
        clone(state.contents.get(key)!),
      ],
    });

    await serverMutators.item.update.fn({
      tx: tx as never,
      ctx: { userId: USER_ID },
      args: {
        workspaceId: WORKSPACE_ID,
        id: image.id,
        changes: { subtitle: "Updated subtitle" },
      },
    });

    expect(state.extracteds.get(key)?.ocrPages).toEqual([
      { index: 0, markdown: "Caption text" },
    ]);
    expect(state.shells.get(key)?.hasOcr).toBe(true);
    expect(state.shells.get(key)?.ocrPageCount).toBe(1);
  });

  it("folder.createWithItems preserves OCR for moved items", async () => {
    const state = createState();
    const pdf: Item = {
      id: "pdf-1",
      type: "pdf",
      name: "Reference PDF",
      subtitle: "",
      data: {
        fileUrl: "https://example.com/reference.pdf",
        filename: "reference.pdf",
        ocrStatus: "complete",
        ocrPages: [{ index: 0, markdown: "Page body" }],
      },
    };
    seedItem(state, pdf);

    const zeroTx = createZeroTx(state);

    await mutators.folder.createWithItems.fn({
      tx: zeroTx as never,
      ctx: { userId: USER_ID },
      args: {
        workspaceId: WORKSPACE_ID,
        folder: {
          id: "folder-1",
          type: "folder",
          name: "Folder",
          subtitle: "",
          data: {},
        },
        itemIds: [pdf.id],
      },
    });

    await syncExtractedRow(
      createWrappedTx(state, {
        workspaceId: WORKSPACE_ID,
        itemId: pdf.id,
      }) as never,
      {
        workspaceId: WORKSPACE_ID,
        itemId: pdf.id,
        userId: USER_ID,
      },
    );

    const key = itemKey(WORKSPACE_ID, pdf.id);
    expect(state.shells.get(key)?.folderId).toBe("folder-1");
    expect(state.extracteds.get(key)?.ocrPages).toEqual([
      { index: 0, markdown: "Page body" },
    ]);
    expect(state.shells.get(key)?.hasOcr).toBe(true);
  });

  it("Client optimistic upsertItem no longer clobbers shell flags", async () => {
    const update = vi.fn(async (_row: Record<string, unknown>) => {});
    const upsert = vi.fn(async (_row: Record<string, unknown>) => {});
    const tx = {
      mutate: {
        workspace_items: {
          update,
        },
        workspace_item_content: {
          upsert,
        },
      },
    };
    const pdf: Item = {
      id: "pdf-1",
      type: "pdf",
      name: "Client PDF",
      subtitle: "",
      data: {
        fileUrl: "https://example.com/file.pdf",
        filename: "file.pdf",
      },
    };

    await upsertItem(tx as never, {
      workspaceId: WORKSPACE_ID,
      item: pdf,
      sourceVersion: 3,
      userId: USER_ID,
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("hasOcr");
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("ocrPageCount");
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("hasTranscript");
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("contentHash");
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("ocrStatus");
    expect(update.mock.calls[0]?.[0]).not.toHaveProperty("processingStatus");
    // User-editable shell fields must still flow through the shared update.
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      itemId: pdf.id,
      name: pdf.name,
      subtitle: pdf.subtitle,
    });
  });

  it("Regression — item.delete still cleans up extracted", async () => {
    const state = createState();
    const pdf: Item = {
      id: "pdf-1",
      type: "pdf",
      name: "Delete me",
      subtitle: "",
      data: {
        fileUrl: "https://example.com/delete.pdf",
        filename: "delete.pdf",
        ocrStatus: "complete",
        ocrPages: [{ index: 0, markdown: "Delete body" }],
      },
    };
    seedItem(state, pdf);

    const key = itemKey(WORKSPACE_ID, pdf.id);
    const tx = createServerTx(state, {
      workspaceId: WORKSPACE_ID,
      itemId: pdf.id,
      runQueue: [clone(state.shells.get(key)!)],
    });

    await serverMutators.item.delete.fn({
      tx: tx as never,
      ctx: { userId: USER_ID },
      args: {
        workspaceId: WORKSPACE_ID,
        id: pdf.id,
      },
    });

    expect(state.shells.has(key)).toBe(false);
    expect(state.contents.has(key)).toBe(false);
    expect(state.extracteds.has(key)).toBe(false);
  });

  it("Regression — item.move doesn't touch extracted", async () => {
    const state = createState();
    const pdf: Item = {
      id: "pdf-1",
      type: "pdf",
      name: "Move me",
      subtitle: "",
      data: {
        fileUrl: "https://example.com/move.pdf",
        filename: "move.pdf",
        ocrStatus: "complete",
        ocrPages: [{ index: 0, markdown: "Page body" }],
      },
    };
    seedItem(state, pdf);

    const key = itemKey(WORKSPACE_ID, pdf.id);
    const before = clone(state.extracteds.get(key)!);
    const tx = createServerTx(state, {
      workspaceId: WORKSPACE_ID,
      itemId: pdf.id,
    });

    await serverMutators.item.move.fn({
      tx: tx as never,
      ctx: { userId: USER_ID },
      args: {
        workspaceId: WORKSPACE_ID,
        itemId: pdf.id,
        folderId: "folder-2",
      },
    });

    expect(state.shells.get(key)?.folderId).toBe("folder-2");
    expect(state.extracteds.get(key)).toEqual(before);
  });
});
