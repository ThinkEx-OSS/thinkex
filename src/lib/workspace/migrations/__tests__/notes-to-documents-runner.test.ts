import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  db: {},
  workspaces: {},
}));

vi.mock("@/lib/workspace/state-loader", () => ({
  loadWorkspaceState: vi.fn(),
}));

describe("resolveWorkspaceSlugMatches", () => {
  let resolveWorkspaceSlugMatches: typeof import("@/lib/workspace/migrations/notes-to-documents-runner").resolveWorkspaceSlugMatches;
  let DuplicateWorkspaceSlugError: typeof import("@/lib/workspace/migrations/notes-to-documents-runner").DuplicateWorkspaceSlugError;

  beforeAll(async () => {
    const mod = await import("@/lib/workspace/migrations/notes-to-documents-runner");
    resolveWorkspaceSlugMatches = mod.resolveWorkspaceSlugMatches;
    DuplicateWorkspaceSlugError = mod.DuplicateWorkspaceSlugError;
  });

  it("returns the single workspace match for a slug", () => {
    const matches = resolveWorkspaceSlugMatches("my-workspace", [
      { id: "ws-1", slug: "my-workspace", name: "Workspace", userId: "user-1" },
    ]);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe("ws-1");
  });

  it("throws a duplicate-slug error with candidate matches", () => {
    expect(() =>
      resolveWorkspaceSlugMatches("shared-slug", [
        { id: "ws-1", slug: "shared-slug", name: "Alpha", userId: "user-1" },
        { id: "ws-2", slug: "shared-slug", name: "Beta", userId: "user-2" },
      ]),
    ).toThrowError(DuplicateWorkspaceSlugError);

    try {
      resolveWorkspaceSlugMatches("shared-slug", [
        { id: "ws-1", slug: "shared-slug", name: "Alpha", userId: "user-1" },
        { id: "ws-2", slug: "shared-slug", name: "Beta", userId: "user-2" },
      ]);
    } catch (error) {
      expect(error).toBeInstanceOf(DuplicateWorkspaceSlugError);
      expect((error as InstanceType<typeof DuplicateWorkspaceSlugError>).matches).toHaveLength(2);
    }
  });
});
