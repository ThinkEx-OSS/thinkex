import type { AgentState, DocumentData, Item, NoteData } from "@/lib/workspace-state/types";
import { getNoteContentAsMarkdown } from "@/lib/utils/format-workspace-context";

export interface NoteMigrationItemReport {
  itemId: string;
  itemName: string;
  markdownLength: number;
  droppedSources: number;
  droppedDeepResearch: boolean;
}

export interface WorkspaceNoteMigrationReport {
  changed: boolean;
  noteCount: number;
  migratedCount: number;
  emptyMarkdownCount: number;
  droppedSourcesCount: number;
  droppedDeepResearchCount: number;
  items: NoteMigrationItemReport[];
}

export interface WorkspaceMigrationResult {
  nextState: AgentState;
  report: WorkspaceNoteMigrationReport;
}

export function migrateNoteItem(item: Item): { item: Item; report: NoteMigrationItemReport } {
  if (item.type !== "note") {
    throw new Error(`Expected note item, received "${item.type}"`);
  }

  const noteData = item.data as NoteData;
  const legacyDeepResearch = (noteData as NoteData & { deepResearch?: unknown }).deepResearch;
  const markdown = getNoteContentAsMarkdown(noteData);
  const migratedData: DocumentData = {
    markdown,
    ...(noteData.sources?.length && { sources: noteData.sources }),
  };

  return {
    item: {
      ...item,
      type: "document",
      data: migratedData,
    },
    report: {
      itemId: item.id,
      itemName: item.name,
      markdownLength: markdown.length,
      droppedSources: 0,
      droppedDeepResearch: Boolean(legacyDeepResearch),
    },
  };
}

export function migrateWorkspaceState(state: AgentState): WorkspaceMigrationResult {
  const itemReports: NoteMigrationItemReport[] = [];

  const nextItems = state.items.map((item) => {
    if (item.type !== "note") {
      return item;
    }

    const migrated = migrateNoteItem(item);
    itemReports.push(migrated.report);
    return migrated.item;
  });

  const report: WorkspaceNoteMigrationReport = {
    changed: itemReports.length > 0,
    noteCount: itemReports.length,
    migratedCount: itemReports.length,
    emptyMarkdownCount: itemReports.filter((item) => item.markdownLength === 0).length,
    droppedSourcesCount: itemReports.reduce((sum, item) => sum + item.droppedSources, 0),
    droppedDeepResearchCount: itemReports.filter((item) => item.droppedDeepResearch).length,
    items: itemReports,
  };

  return {
    nextState: {
      ...state,
      items: nextItems,
    },
    report,
  };
}
