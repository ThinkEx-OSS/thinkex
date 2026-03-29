import { runNotesToDocumentsMigration, type MigrationSummary } from "../src/lib/workspace/migrations/notes-to-documents-runner";

interface CliOptions {
  execute: boolean;
  workspaceId?: string;
  workspaceSlug?: string;
  limit?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { execute: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) continue;

    if (arg === "--execute") {
      options.execute = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.execute = false;
      continue;
    }

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

    if (arg === "--limit") {
      const rawLimit = argv[index + 1];
      const limit = rawLimit ? Number(rawLimit) : Number.NaN;
      if (Number.isNaN(limit) || limit <= 0) {
        throw new Error(`Invalid --limit value "${rawLimit ?? ""}"`);
      }
      options.limit = limit;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument "${arg}"`);
  }

  return options;
}

function printSummary(summary: MigrationSummary, execute: boolean): void {
  console.log(`Mode: ${execute ? "execute" : "dry-run"}`);
  console.log(`Processed workspaces: ${summary.processedWorkspaces}`);
  console.log(`Changed workspaces: ${summary.changedWorkspaces}`);
  console.log(`Migrated notes: ${summary.migratedNotes}`);
  console.log(`Empty markdown notes: ${summary.emptyMarkdownNotes}`);
  console.log(`Dropped sources: ${summary.droppedSourcesCount}`);

  for (const result of summary.results) {
    const { workspace, report, wroteSnapshot } = result;
    const status = report.changed
      ? wroteSnapshot
        ? "migrated"
        : "would-migrate"
      : "unchanged";

    console.log(
      `[${status}] ${workspace.id} slug=${workspace.slug ?? "(none)"} name="${workspace.name}" notes=${report.noteCount} emptyMarkdown=${report.emptyMarkdownCount}`,
    );
  }

  if (summary.failures.length > 0) {
    console.error("Failures:");
    for (const failure of summary.failures) {
      const workspaceLabel = failure.workspace
        ? `${failure.workspace.id} slug=${failure.workspace.slug ?? "(none)"}`
        : "global";
      console.error(`- ${workspaceLabel}: ${failure.error}`);
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const summary = await runNotesToDocumentsMigration(options);

  printSummary(summary, options.execute);

  if (summary.failures.length > 0 && options.execute) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
