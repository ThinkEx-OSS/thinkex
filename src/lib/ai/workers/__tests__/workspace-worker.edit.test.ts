import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockHeaders = vi.fn();
const mockLoadWorkspaceState = vi.fn();
const mockCreateEvent = vi.fn();
const mockExecute = vi.fn();

const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: (...args: any[]) => mockGetSession(...args),
    },
  },
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: (...args: any[]) => (mockSelect as (...a: any[]) => unknown).apply(null, args),
    execute: (...args: any[]) => (mockExecute as (...a: any[]) => unknown).apply(null, args),
  },
  workspaces: {
    id: "id",
    userId: "userId",
  },
}));

vi.mock("@/lib/db/schema", () => ({
  workspaceCollaborators: {
    workspaceId: "workspaceId",
    userId: "userId",
    permissionLevel: "permissionLevel",
  },
}));

vi.mock("@/lib/workspace/state-loader", () => ({
  loadWorkspaceState: (...args: any[]) => mockLoadWorkspaceState(...args),
}));

vi.mock("@/lib/workspace/events", () => ({
  createEvent: (...args: any[]) => mockCreateEvent(...args),
}));

vi.mock("@/lib/workspace/unique-name", () => ({
  hasDuplicateName: () => false,
}));

describe("workspaceWorker edit end-to-end paths", () => {
  let workspaceWorker: typeof import("@/lib/ai/workers/workspace-worker").workspaceWorker;
  let workspaceOperationQueues: Map<string, Promise<unknown>>;

  beforeAll(async () => {
    const workerMod = await import("@/lib/ai/workers/workspace-worker");
    workspaceWorker = workerMod.workspaceWorker;
    const commonMod = await import("@/lib/ai/workers/common");
    workspaceOperationQueues = commonMod.workspaceOperationQueues;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    workspaceOperationQueues.clear();

    mockHeaders.mockResolvedValue(new Headers());
    mockGetSession.mockResolvedValue({ user: { id: "user-1" } });
    mockLimit.mockResolvedValue([{ userId: "user-1" }]); // workspace owner path
    mockCreateEvent.mockImplementation((type: string, payload: unknown, userId: string) => ({
      id: "evt-1",
      type,
      payload,
      timestamp: 123,
      userId,
    }));
  });

  it("edits quiz JSON and appends question near end", async () => {
    mockLoadWorkspaceState.mockResolvedValue({
      items: [
        {
          id: "quiz-1",
          type: "quiz",
          name: "Quiz 1",
          subtitle: "",
          data: {
            questions: [
              {
                id: "q1",
                type: "multiple_choice",
                questionText: "Q1",
                options: ["A", "B", "C", "D"],
                correctIndex: 0,
                explanation: "e1",
              },
            ],
          },
        },
      ],
      globalTitle: "",
      workspaceId: "ws-1",
    });

    mockExecute
      .mockResolvedValueOnce([{ version: 1 }]) // get_workspace_version
      .mockResolvedValueOnce([{ result: "(2,f)" }]); // append_workspace_event

    const result = await workspaceWorker("edit", {
      workspaceId: "ws-1",
      itemId: "quiz-1",
      itemType: "quiz",
      itemName: "Quiz 1",
      oldString: "  ]\n}",
      newString: [
        "    ,",
        "    {",
        '      "id": "q2",',
        '      "type": "multiple_choice",',
        '      "questionText": "Q2",',
        '      "options": ["A", "B", "C", "D"],',
        '      "correctIndex": 1,',
        '      "explanation": "e2"',
        "    }",
        "  ]",
        "}",
      ].join("\n"),
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/Updated quiz/);
    expect((result as any).questionCount).toBe(2);
  });

  it("repairs malformed appended flashcard JSON and succeeds", async () => {
    mockLoadWorkspaceState.mockResolvedValue({
      items: [
        {
          id: "deck-1",
          type: "flashcard",
          name: "Deck 1",
          subtitle: "",
          data: {
            cards: [{ id: "c1", front: "f1", back: "b1" }],
          },
        },
      ],
      globalTitle: "",
      workspaceId: "ws-1",
    });

    mockExecute
      .mockResolvedValueOnce([{ version: 4 }]) // get_workspace_version
      .mockResolvedValueOnce([{ result: "(5,f)" }]); // append_workspace_event

    const result = await workspaceWorker("edit", {
      workspaceId: "ws-1",
      itemId: "deck-1",
      itemType: "flashcard",
      itemName: "Deck 1",
      oldString: "  ]\n}",
      // intentionally malformed but repairable (single quotes + trailing comma)
      newString: [
        "    ,",
        "    {'id':'c2','front':'f2','back':'b2'},",
        "  ]",
        "}",
      ].join("\n"),
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/Updated flashcard deck/);
    expect((result as any).cardCount).toBe(2);
  });

  it("fails quiz edit when repaired JSON violates schema", async () => {
    const initialQuestions = [
      {
        id: "q1",
        type: "multiple_choice",
        questionText: "Q1",
        options: ["A", "B", "C", "D"],
        correctIndex: 0,
        explanation: "e1",
      },
    ];

    mockLoadWorkspaceState.mockResolvedValue({
      items: [
        {
          id: "quiz-1",
          type: "quiz",
          name: "Quiz 1",
          subtitle: "",
          data: {
            questions: initialQuestions,
          },
        },
      ],
      globalTitle: "",
      workspaceId: "ws-1",
    });

    const result = await workspaceWorker("edit", {
      workspaceId: "ws-1",
      itemId: "quiz-1",
      itemType: "quiz",
      itemName: "Quiz 1",
      oldString: JSON.stringify({ questions: initialQuestions }, null, 2),
      // repair may parse this, but schema should reject 3 options for MC
      newString: JSON.stringify(
        {
          questions: [
            {
              ...initialQuestions[0],
              options: ["A", "B", "C"],
            },
          ],
        },
        null,
        2
      ),
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/multiple_choice needs 4 options/i);
  });

  it("fails flashcard edit on unrecoverable invalid JSON", async () => {
    mockLoadWorkspaceState.mockResolvedValue({
      items: [
        {
          id: "deck-1",
          type: "flashcard",
          name: "Deck 1",
          subtitle: "",
          data: {
            cards: [{ id: "c1", front: "f1", back: "b1" }],
          },
        },
      ],
      globalTitle: "",
      workspaceId: "ws-1",
    });

    const result = await workspaceWorker("edit", {
      workspaceId: "ws-1",
      itemId: "deck-1",
      itemType: "flashcard",
      itemName: "Deck 1",
      oldString: "{",
      newString: "{ ???",
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/Invalid JSON after edit/i);
  });

  it("rename-only: updates document name without touching content", async () => {
    const markdown = "Original document content";
    mockLoadWorkspaceState.mockResolvedValue({
      items: [
        {
          id: "doc-1",
          type: "document",
          name: "My Document",
          subtitle: "",
          data: { markdown },
        },
      ],
      globalTitle: "",
      workspaceId: "ws-1",
    });

    mockExecute
      .mockResolvedValueOnce([{ version: 1 }]) // get_workspace_version
      .mockResolvedValueOnce([{ result: "(2,f)" }]); // append_workspace_event

    const result = await workspaceWorker("edit", {
      workspaceId: "ws-1",
      itemId: "doc-1",
      itemType: "document",
      itemName: "My Document",
      oldString: "",
      newString: "",
      newName: "Renamed Document",
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/Updated document successfully/);
    expect(mockCreateEvent).toHaveBeenCalled();
    const eventPayload = mockCreateEvent.mock.calls[0][1] as { id: string; changes: Record<string, unknown> };
    expect(eventPayload.id).toBe("doc-1");
    expect(eventPayload.changes).toEqual({ name: "Renamed Document" });
  });

  it("fails with clear message when oldString is ambiguous", async () => {
    mockLoadWorkspaceState.mockResolvedValue({
      items: [
        {
          id: "quiz-1",
          type: "quiz",
          name: "Quiz 1",
          subtitle: "",
          data: {
            questions: [
              {
                id: "q1",
                type: "multiple_choice",
                questionText: "Same",
                options: ["A", "B", "C", "D"],
                correctIndex: 0,
                explanation: "dup",
              },
              {
                id: "q2",
                type: "multiple_choice",
                questionText: "Same",
                options: ["A", "B", "C", "D"],
                correctIndex: 1,
                explanation: "dup",
              },
            ],
          },
        },
      ],
      globalTitle: "",
      workspaceId: "ws-1",
    });

    const result = await workspaceWorker("edit", {
      workspaceId: "ws-1",
      itemId: "quiz-1",
      itemType: "quiz",
      itemName: "Quiz 1",
      oldString: '"questionText": "Same"',
      newString: '"questionText": "Updated"',
      replaceAll: false,
    });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/multiple matches/i);
  });
});

