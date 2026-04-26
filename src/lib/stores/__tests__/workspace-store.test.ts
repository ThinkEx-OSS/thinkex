import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const STORAGE_KEY = "thinkex-workspace-thread-state-v1";

function createLocalStorageMock() {
  const store = new Map<string, string>();

  return {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } satisfies Storage;
}

describe("workspace store chat thread state", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", createLocalStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists only last active persisted thread ids by workspace", async () => {
    const storeModule = await import("../workspace-store");
    const store = storeModule.useWorkspaceStore;

    store.getState().setCurrentWorkspaceId("workspace-1");
    store.getState().setActiveThread("workspace-1", {
      kind: "new",
      id: "local-thread-1",
    });

    expect(globalThis.localStorage.getItem(STORAGE_KEY)).toContain(
      '"lastPersistedThreadIdByWorkspace":{}',
    );

    store.getState().activatePersistedThread("workspace-1", "thread-1");

    const persisted = JSON.parse(
      globalThis.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as {
      state?: {
        lastPersistedThreadIdByWorkspace?: Record<string, string>;
      };
    };

    expect(persisted.state).toEqual({
      lastPersistedThreadIdByWorkspace: { "workspace-1": "thread-1" },
    });

    vi.resetModules();
    const reloadedModule = await import("../workspace-store");
    const reloadedState = reloadedModule.useWorkspaceStore.getState();

    expect(reloadedState.currentWorkspaceId).toBeNull();
    expect(reloadedModule.selectActiveThread("workspace-1")(reloadedState)).toBe(
      undefined,
    );
    expect(
      reloadedModule.selectLastPersistedThreadId("workspace-1")(reloadedState),
    ).toBe("thread-1");
  });

  it("does not restore unsent local thread ids after reload", async () => {
    const storeModule = await import("../workspace-store");
    storeModule.useWorkspaceStore.getState().setActiveThread("workspace-2", {
      kind: "new",
      id: "local-thread-2",
    });

    vi.resetModules();
    const reloadedModule = await import("../workspace-store");
    const reloadedState = reloadedModule.useWorkspaceStore.getState();

    expect(reloadedModule.selectActiveThread("workspace-2")(reloadedState)).toBe(
      undefined,
    );
    expect(
      reloadedModule.selectLastPersistedThreadId("workspace-2")(reloadedState),
    ).toBeUndefined();
  });
});
