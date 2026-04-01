import { describe, expect, it } from "vitest";
import {
  migrateNoteItem,
  migrateWorkspaceState,
} from "@/lib/workspace/migrations/notes-to-documents";
import type { AgentState, Item, NoteData } from "@/lib/workspace-state/types";

function mkParagraph(text: string, id = "p1") {
  return {
    id,
    type: "paragraph",
    content: [{ type: "text", text, styles: {} }],
    children: [],
  };
}

function mkNote(overrides: Partial<Item> = {}): Item {
  return {
    id: "note-1",
    type: "note",
    name: "Legacy Note",
    subtitle: "subtitle",
    color: "#3B82F6",
    folderId: "folder-1",
    layout: { x: 1, y: 2, w: 1, h: 4 },
    data: {
      blockContent: [mkParagraph("Hello world")],
      field1: "ignored",
      sources: [{ title: "Source", url: "https://example.com" }],
    } as NoteData,
    ...overrides,
  };
}

describe("notes-to-documents migration", () => {
  it("migrates a note item to a document and preserves identity/layout fields", () => {
    const note = mkNote();
    const { item, report } = migrateNoteItem(note);

    expect(item.type).toBe("document");
    expect(item.id).toBe(note.id);
    expect(item.name).toBe(note.name);
    expect(item.subtitle).toBe(note.subtitle);
    expect(item.color).toBe(note.color);
    expect(item.folderId).toBe(note.folderId);
    expect(item.layout).toEqual(note.layout);
    expect(item.data).toEqual({
      markdown: "Hello world\n\n",
      sources: [{ title: "Source", url: "https://example.com" }],
    });
    expect(report.droppedSources).toBe(0);
  });

  it("migrates an empty BlockNote note to an empty markdown document", () => {
    const note = mkNote({
      data: {
        blockContent: [],
        field1: "legacy fallback that should be ignored",
      } as NoteData,
    });

    const { item, report } = migrateNoteItem(note);

    expect(item.data).toEqual({ markdown: "" });
    expect(report.markdownLength).toBe(0);
  });

  it("leaves non-note items unchanged", () => {
    const document: Item = {
      id: "doc-1",
      type: "document",
      name: "Document",
      subtitle: "",
      data: { markdown: "Existing" },
    };
    const state: AgentState = {
      items: [document],
      globalTitle: "Workspace",
    };

    const result = migrateWorkspaceState(state);

    expect(result.report.changed).toBe(false);
    expect(result.nextState).toEqual(state);
  });

  it("is idempotent once a workspace contains only documents", () => {
    const initialState: AgentState = {
      items: [mkNote()],
      globalTitle: "Workspace",
    };

    const firstPass = migrateWorkspaceState(initialState);
    const secondPass = migrateWorkspaceState(firstPass.nextState);

    expect(firstPass.report.changed).toBe(true);
    expect(secondPass.report.changed).toBe(false);
    expect(secondPass.nextState).toEqual(firstPass.nextState);
  });
});
