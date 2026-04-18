import { describe, expect, it } from "vitest";
import {
  sortParentsBeforeChildren,
  buildChildrenMap,
  getHeadPath,
  getSiblings,
  getLatestLeafId,
} from "./message-tree";
import type { ThinkexUIMessage } from "./types";

const createMessage = (id: string): ThinkexUIMessage =>
  ({ id, role: "user", parts: [] }) as ThinkexUIMessage;

describe("sortParentsBeforeChildren", () => {
  it("keeps parents before children when API rows arrive newest-first", () => {
    const sorted = sortParentsBeforeChildren(
      [
        {
          parentId: "parent",
          message: { id: "child" },
          created_at: "2025-01-02T00:00:00.000Z",
        },
        {
          parentId: null,
          message: { id: "parent" },
          created_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      (item) => item.created_at
    );

    expect(sorted.map((item) => item.message.id)).toEqual(["parent", "child"]);
  });

  it("keeps orphaned subtrees ordered parent-before-child", () => {
    const sorted = sortParentsBeforeChildren(
      [
        {
          parentId: "missing-root",
          message: { id: "orphan-parent" },
          created_at: "2025-01-02T00:00:00.000Z",
        },
        {
          parentId: "orphan-parent",
          message: { id: "orphan-child" },
          created_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      (item) => item.created_at
    );

    expect(sorted.map((item) => item.message.id)).toEqual([
      "orphan-parent",
      "orphan-child",
    ]);
  });

  it("breaks cycles one item at a time in stable timestamp order", () => {
    const sorted = sortParentsBeforeChildren(
      [
        {
          parentId: "b",
          message: { id: "a" },
          created_at: "2025-01-02T00:00:00.000Z",
        },
        {
          parentId: "a",
          message: { id: "b" },
          created_at: "2025-01-01T00:00:00.000Z",
        },
      ],
      (item) => item.created_at
    );

    expect(sorted.map((item) => item.message.id)).toEqual(["b", "a"]);
  });
});

describe("buildChildrenMap", () => {
  it("groups children by parent id and uses null for roots", () => {
    const childrenMap = buildChildrenMap(
      new Map([
        ["A", null],
        ["B", "A"],
        ["C", "A"],
        ["D", null],
      ])
    );

    expect(childrenMap.get(null)).toEqual(["A", "D"]);
    expect(childrenMap.get("A")).toEqual(["B", "C"]);
  });

  it("returns an empty map for empty input", () => {
    expect(buildChildrenMap(new Map())).toEqual(new Map());
  });
});

describe("getSiblings", () => {
  it("returns all children sharing the same parent in insertion order", () => {
    const parentMap = new Map<string, string | null>([
      ["A", null],
      ["B", "A"],
      ["C", "A"],
    ]);
    const childrenMap = buildChildrenMap(parentMap);

    expect(getSiblings(parentMap, childrenMap, "B")).toEqual(["B", "C"]);
    expect(getSiblings(parentMap, childrenMap, "C")).toEqual(["B", "C"]);
  });

  it("returns the message id when no parent entry exists", () => {
    expect(getSiblings(new Map(), new Map(), "missing")).toEqual(["missing"]);
  });
});

describe("getHeadPath", () => {
  it("returns a linear path from root to head", () => {
    const messagesById = new Map<string, ThinkexUIMessage>([
      ["A", createMessage("A")],
      ["B", createMessage("B")],
      ["C", createMessage("C")],
    ]);
    const parentMap = new Map<string, string | null>([
      ["A", null],
      ["B", "A"],
      ["C", "B"],
    ]);
    const childrenMap = buildChildrenMap(parentMap);

    expect(
      getHeadPath(messagesById, parentMap, childrenMap, "C", {}).map(
        (message) => message.id
      )
    ).toEqual(["A", "B", "C"]);
  });

  it("returns the correct branch path for each head", () => {
    const messagesById = new Map<string, ThinkexUIMessage>([
      ["A", createMessage("A")],
      ["B", createMessage("B")],
      ["B2", createMessage("B2")],
    ]);
    const parentMap = new Map<string, string | null>([
      ["A", null],
      ["B", "A"],
      ["B2", "A"],
    ]);
    const childrenMap = buildChildrenMap(parentMap);

    expect(
      getHeadPath(messagesById, parentMap, childrenMap, "B", {}).map(
        (message) => message.id
      )
    ).toEqual(["A", "B"]);
    expect(
      getHeadPath(messagesById, parentMap, childrenMap, "B2", {}).map(
        (message) => message.id
      )
    ).toEqual(["A", "B2"]);
  });

  it("falls back to the latest leaf when headId is null", () => {
    const messagesById = new Map<string, ThinkexUIMessage>([
      ["A", { ...createMessage("A"), metadata: { createdAt: Date.parse("2025-01-01T00:00:00.000Z") } }],
      ["B", { ...createMessage("B"), metadata: { createdAt: Date.parse("2025-01-02T00:00:00.000Z") } }],
      ["C", { ...createMessage("C"), metadata: { createdAt: Date.parse("2025-01-03T00:00:00.000Z") } }],
    ]);
    const parentMap = new Map<string, string | null>([
      ["A", null],
      ["B", "A"],
      ["C", "B"],
    ]);
    const childrenMap = buildChildrenMap(parentMap);

    expect(
      getHeadPath(messagesById, parentMap, childrenMap, null, {}).map(
        (message) => message.id
      )
    ).toEqual(["A", "B", "C"]);
  });

  it("returns an orphan head without crashing when its parent is missing", () => {
    const messagesById = new Map<string, ThinkexUIMessage>([
      ["P", createMessage("P")],
    ]);
    const parentMap = new Map<string, string | null>([["P", "missing-root"]]);
    const childrenMap = buildChildrenMap(parentMap);

    expect(
      getHeadPath(messagesById, parentMap, childrenMap, "P", {}).map(
        (message) => message.id
      )
    ).toEqual(["P"]);
  });

  it("returns an empty path for an empty tree with no head", () => {
    expect(getHeadPath(new Map(), new Map(), new Map(), null, {})).toEqual([]);
  });
});

describe("getLatestLeafId", () => {
  it("returns null for an empty message list", () => {
    expect(getLatestLeafId([], new Map())).toBeNull();
  });

  it("returns the single leaf in a one-node tree", () => {
    const childrenMap = buildChildrenMap(new Map([["A", null]]));
    expect(
      getLatestLeafId([{ id: "A", created_at: "2025-01-01T00:00:00.000Z" }], childrenMap)
    ).toBe("A");
  });

  it("returns the leaf with the greatest created_at", () => {
    const parentMap = new Map<string, string | null>([
      ["A", null],
      ["B", "A"],
      ["C", "A"],
    ]);
    const childrenMap = buildChildrenMap(parentMap);

    expect(
      getLatestLeafId(
        [
          { id: "A", created_at: "2025-01-01T00:00:00.000Z" },
          { id: "B", created_at: "2025-01-02T00:00:00.000Z" },
          { id: "C", created_at: "2025-01-03T00:00:00.000Z" },
        ],
        childrenMap
      )
    ).toBe("C");
  });

  it("breaks created_at ties with id.localeCompare", () => {
    const parentMap = new Map<string, string | null>([
      ["A", null],
      ["B", "A"],
      ["C", "A"],
    ]);
    const childrenMap = buildChildrenMap(parentMap);

    expect(
      getLatestLeafId(
        [
          { id: "A", created_at: "2025-01-01T00:00:00.000Z" },
          { id: "B", created_at: "2025-01-03T00:00:00.000Z" },
          { id: "C", created_at: "2025-01-03T00:00:00.000Z" },
        ],
        childrenMap
      )
    ).toBe("C");
  });
});
