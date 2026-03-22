import { db, workspaces } from "../src/lib/db/client";
import { asc, eq } from "drizzle-orm";
import { loadWorkspaceState } from "../src/lib/workspace/state-loader";
import { migrateNoteItem, migrateWorkspaceState } from "../src/lib/workspace/migrations/notes-to-documents";
import type { Item, NoteData } from "../src/lib/workspace-state/types";

interface CliOptions {
  workspaceId?: string;
  workspaceSlug?: string;
  sampleLimit: number;
  previewLimit: number;
  noteNames: string[];
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { sampleLimit: 5, previewLimit: 500, noteNames: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "--workspace-id") {
      options.workspaceId = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--workspace-slug") {
      options.workspaceSlug = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--sample-limit") {
      const rawValue = argv[index + 1];
      const value = rawValue ? Number(rawValue) : Number.NaN;
      if (Number.isNaN(value) || value <= 0) {
        throw new Error(`Invalid --sample-limit value "${rawValue ?? ""}"`);
      }
      options.sampleLimit = value;
      index += 1;
      continue;
    }

    if (arg === "--preview-limit") {
      const rawValue = argv[index + 1];
      const value = rawValue ? Number(rawValue) : Number.NaN;
      if (Number.isNaN(value) || value <= 0) {
        throw new Error(`Invalid --preview-limit value "${rawValue ?? ""}"`);
      }
      options.previewLimit = value;
      index += 1;
      continue;
    }

    if (arg === "--note-name") {
      const noteName = argv[index + 1];
      if (!noteName) {
        throw new Error("Missing value for --note-name");
      }
      options.noteNames.push(noteName);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument "${arg}"`);
  }

  if (!options.workspaceId && !options.workspaceSlug) {
    throw new Error("Provide --workspace-id or --workspace-slug");
  }

  return options;
}

async function resolveWorkspaceId(options: CliOptions): Promise<{ id: string; slug: string | null; name: string }> {
  if (options.workspaceId) {
    const rows = await db
      .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, options.workspaceId))
      .limit(1);

    if (!rows[0]) {
      throw new Error(`Workspace not found for id "${options.workspaceId}"`);
    }

    return rows[0];
  }

  const rows = await db
    .select({ id: workspaces.id, slug: workspaces.slug, name: workspaces.name, userId: workspaces.userId })
    .from(workspaces)
    .where(eq(workspaces.slug, options.workspaceSlug!))
    .orderBy(asc(workspaces.createdAt));

  if (rows.length === 0) {
    throw new Error(`No workspace found for slug "${options.workspaceSlug}"`);
  }

  if (rows.length > 1) {
    throw new Error(
      `Multiple workspaces found for slug "${options.workspaceSlug}": ${rows
        .map((row) => `${row.id} (${row.userId}) ${row.name}`)
        .join(", ")}`,
    );
  }

  return rows[0];
}

function preview(text: string, limit = 400): string {
  return text.slice(0, limit);
}

function firstDifferenceIndex(a: string, b: string): number {
  const shortest = Math.min(a.length, b.length);
  for (let index = 0; index < shortest; index += 1) {
    if (a[index] !== b[index]) return index;
  }
  return a.length === b.length ? -1 : shortest;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const workspace = await resolveWorkspaceId(options);
  const state = await loadWorkspaceState(workspace.id);
  const notes = state.items.filter((item): item is Item & { type: "note" } => item.type === "note");
  const migration = migrateWorkspaceState(state);

  const analyzed = notes.map((item) => {
    const noteData = item.data as NoteData;
    const migrated = migrateNoteItem(item);
    const markdown = (migrated.item.data as { markdown?: string }).markdown ?? "";
    const field1 = typeof noteData.field1 === "string" ? noteData.field1.trim() : "";

    return {
      id: item.id,
      name: item.name,
      blockCount: Array.isArray(noteData.blockContent) ? noteData.blockContent.length : 0,
      markdown,
      markdownLength: markdown.length,
      field1Length: field1.length,
      field1Preview: preview(field1, 200),
      sourcesCount: noteData.sources?.length ?? 0,
    };
  });

  const emptyMarkdown = analyzed.filter((item) => item.markdownLength === 0);
  const withSources = analyzed.filter((item) => item.sourcesCount > 0);
  const sampleNotes = analyzed
    .filter((item) => item.markdownLength > 0)
    .slice(0, options.sampleLimit)
    .map((item) => ({
      id: item.id,
      name: item.name,
      blockCount: item.blockCount,
      sourcesCount: item.sourcesCount,
      markdownLength: item.markdownLength,
      beforeSerializedMarkdownPreview: preview(item.markdown, options.previewLimit),
      afterStoredMarkdownPreview: preview(item.markdown, options.previewLimit),
    }));

  const selectedComparisons = options.noteNames.map((noteName) => {
    const note = notes.find((item) => item.name === noteName);
    if (!note) {
      return {
        noteName,
        found: false,
      };
    }

    const migrated = migrateNoteItem(note);
    const beforeMarkdown = (migrated.item.data as { markdown?: string }).markdown ?? "";
    const afterMarkdown = beforeMarkdown;
    const diffIndex = firstDifferenceIndex(beforeMarkdown, afterMarkdown);

    return {
      noteName,
      found: true,
      id: note.id,
      exactMatch: beforeMarkdown === afterMarkdown,
      firstDifferenceIndex: diffIndex,
      beforeLength: beforeMarkdown.length,
      afterLength: afterMarkdown.length,
      beforePreview: preview(beforeMarkdown, options.previewLimit),
      afterPreview: preview(afterMarkdown, options.previewLimit),
    };
  });

  console.log(
    JSON.stringify(
      {
        workspace,
        summary: {
          totalNotes: analyzed.length,
          migratedNotes: migration.report.migratedCount,
          emptyMarkdownCount: migration.report.emptyMarkdownCount,
          droppedSourcesCount: migration.report.droppedSourcesCount,
          droppedDeepResearchCount: migration.report.droppedDeepResearchCount,
        },
        emptyMarkdownNotes: emptyMarkdown.map((item) => ({
          id: item.id,
          name: item.name,
          blockCount: item.blockCount,
          field1Length: item.field1Length,
          field1Preview: item.field1Preview,
        })),
        notesWithSources: withSources.map((item) => ({
          id: item.id,
          name: item.name,
          sourcesCount: item.sourcesCount,
          markdownLength: item.markdownLength,
        })),
        selectedComparisons,
        sampleBeforeAfter: sampleNotes,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
