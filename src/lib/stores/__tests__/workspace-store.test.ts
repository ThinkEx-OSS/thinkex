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

  it("persists only thread ids by workspace", async () => {
    const storeModule = await import("../workspace-store");
    const store = storeModule.useWorkspaceStore;

    store.getState().setCurrentWorkspaceId("workspace-1");
    store.getState().setCurrentThreadId("workspace-1", "thread-1");

    const persisted = JSON.parse(
      globalThis.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as {
      state?: {
        currentThreadIdByWorkspace?: Record<string, string>;
        currentWorkspaceId?: string | null;
      };
    };

    expect(persisted.state).toEqual({
      currentThreadIdByWorkspace: { "workspace-1": "thread-1" },
    });

    vi.resetModules();
    const reloadedModule = await import("../workspace-store");
    const reloadedState = reloadedModule.useWorkspaceStore.getState();

    expect(reloadedState.currentWorkspaceId).toBeNull();
    expect(
      reloadedModule.selectCurrentThreadId("workspace-1")(reloadedState),
    ).toBe("thread-1");
  });

  it("guards clearing when another thread is already active", async () => {
    const storeModule = await import("../workspace-store");
    const store = storeModule.useWorkspaceStore;

    store.getState().setCurrentThreadId("workspace-1", "thread-2");
    store.getState().clearCurrentThreadId("workspace-1", "thread-1");

    expect(
      storeModule.selectCurrentThreadId("workspace-1")(store.getState()),
    ).toBe("thread-2");
  });
});
