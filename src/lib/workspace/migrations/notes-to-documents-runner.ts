import { randomUUID } from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db, workspaces } from "@/lib/db/client";
import { loadWorkspaceState } from "@/lib/workspace/state-loader";
import { migrateWorkspaceState, type WorkspaceNoteMigrationReport } from "./notes-to-documents";
import type { AgentState } from "@/lib/workspace-state/types";

export interface WorkspaceMigrationTarget {
  id: string;
  slug: string | null;
  name: string;
  userId: string;
}

export interface MigrationRunOptions {
  execute?: boolean;
  workspaceId?: string;
  workspaceSlug?: string;
  limit?: number;
  progressEvery?: number;
  logger?: Pick<typeof console, "log" | "error" | "warn">;
}

export interface WorkspaceMigrationRunResult {
  workspace: WorkspaceMigrationTarget;
  report: WorkspaceNoteMigrationReport;
  wroteSnapshot: boolean;
}

export interface MigrationSummary {
  processedWorkspaces: number;
  changedWorkspaces: number;
  migratedNotes: number;
  emptyMarkdownNotes: number;
  droppedSourcesCount: number;
  results: WorkspaceMigrationRunResult[];
  failures: Array<{ workspace?: WorkspaceMigrationTarget; error: string }>;
}

type AppendResult = { version: number; conflict: boolean };

export class DuplicateWorkspaceSlugError extends Error {
  constructor(
    public readonly slug: string,
    public readonly matches: WorkspaceMigrationTarget[],
  ) {
    super(
      `Multiple workspaces found for slug "${slug}": ${matches
        .map((match) => `${match.id} (${match.userId}) ${match.name}`)
        .join(", ")}`,
    );
  }
}

function parseAppendResult(rawResult: unknown): AppendResult {
  if (typeof rawResult === "object" && rawResult !== null) {
    const obj = rawResult as Record<string, unknown>;
    const version = Number(obj.version ?? 0);
    const conflictValue = obj.conflict;
    const conflict =
      conflictValue === true ||
      (typeof conflictValue === "string" &&
        ["t", "true"].includes(conflictValue.toLowerCase().trim()));
    return { version: Number.isNaN(version) ? 0 : version, conflict };
  }

  const resultString = typeof rawResult === "string" ? rawResult : String(rawResult);
  const match = resultString.match(/\(\s*(\d+)\s*,\s*(t|f|true|false)\s*\)/i);
  if (!match) {
    return { version: 0, conflict: false };
  }

  return {
    version: parseInt(match[1], 10),
    conflict: ["t", "true"].includes(match[2].toLowerCase()),
  };
}

function toWorkspaceTarget(row: typeof workspaces.$inferSelect): WorkspaceMigrationTarget {
  return {
    id: row.id,
    slug: row.slug ?? null,
    name: row.name,
    userId: row.userId,
  };
}

export function resolveWorkspaceSlugMatches(
  slug: string,
  matches: WorkspaceMigrationTarget[],
): WorkspaceMigrationTarget[] {
  if (matches.length === 0) {
    throw new Error(`No workspace found for slug "${slug}"`);
  }
  if (matches.length > 1) {
    throw new DuplicateWorkspaceSlugError(slug, matches);
  }
  return matches;
}

async function appendWorkspaceSnapshot(
  workspaceId: string,
  nextState: AgentState,
  userId: string,
  userName: string,
): Promise<AppendResult> {
  const currentVersionResult = await db.execute(sql`
    SELECT get_workspace_version(${workspaceId}::uuid) as version
  `);
  const baseVersion = Number(currentVersionResult[0]?.version ?? 0);

  const eventResult = await db.execute(sql`
    SELECT append_workspace_event(
      ${workspaceId}::uuid,
      ${randomUUID()}::text,
      ${"WORKSPACE_SNAPSHOT"}::text,
      ${JSON.stringify(nextState)}::jsonb,
      ${Date.now()}::bigint,
      ${userId}::text,
      ${baseVersion}::integer,
      ${userName}::text
    ) as result
  `);

  if (!eventResult.length) {
    throw new Error("Failed to append WORKSPACE_SNAPSHOT event");
  }

  return parseAppendResult(eventResult[0].result);
}

async function resolveTargets(options: MigrationRunOptions): Promise<WorkspaceMigrationTarget[]> {
  if (options.workspaceId) {
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, options.workspaceId))
      .limit(1);
    if (!rows[0]) {
      throw new Error(`Workspace not found for id "${options.workspaceId}"`);
    }
    return [toWorkspaceTarget(rows[0])];
  }

  if (options.workspaceSlug) {
    const rows = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, options.workspaceSlug))
      .orderBy(asc(workspaces.createdAt));
    return resolveWorkspaceSlugMatches(options.workspaceSlug, rows.map(toWorkspaceTarget));
  }

  const baseQuery = db
    .select()
    .from(workspaces)
    .orderBy(asc(workspaces.createdAt));

  const rows = options.limit && options.limit > 0
    ? await baseQuery.limit(options.limit)
    : await baseQuery;

  return rows.map(toWorkspaceTarget);
}

async function migrateSingleWorkspace(
  workspace: WorkspaceMigrationTarget,
  execute: boolean,
): Promise<WorkspaceMigrationRunResult> {
  let state = await loadWorkspaceState(workspace.id);
  let migration = migrateWorkspaceState(state);

  if (!migration.report.changed || !execute) {
    return {
      workspace,
      report: migration.report,
      wroteSnapshot: false,
    };
  }

  const migrationUserId = "system:notes-to-documents-migration";
  const migrationUserName = "Notes to Documents Migration";

  for (let attempt = 0; attempt < 2; attempt++) {
    const appendResult = await appendWorkspaceSnapshot(
      workspace.id,
      migration.nextState,
      migrationUserId,
      migrationUserName,
    );

    if (!appendResult.conflict) {
      return {
        workspace,
        report: migration.report,
        wroteSnapshot: true,
      };
    }

    if (attempt === 1) {
      break;
    }

    state = await loadWorkspaceState(workspace.id);
    migration = migrateWorkspaceState(state);

    if (!migration.report.changed) {
      return {
        workspace,
        report: migration.report,
        wroteSnapshot: false,
      };
    }
  }

  throw new Error("Workspace version conflict persisted after retry");
}

export async function runNotesToDocumentsMigration(
  options: MigrationRunOptions,
): Promise<MigrationSummary> {
  const logger = options.logger ?? console;
  const targets = await resolveTargets(options);
  const execute = Boolean(options.execute);
  const progressEvery = Math.max(1, options.progressEvery ?? 25);
  const summary: MigrationSummary = {
    processedWorkspaces: 0,
    changedWorkspaces: 0,
    migratedNotes: 0,
    emptyMarkdownNotes: 0,
    droppedSourcesCount: 0,
    results: [],
    failures: [],
  };

  for (const workspace of targets) {
    try {
      const result = await migrateSingleWorkspace(workspace, execute);
      summary.processedWorkspaces += 1;
      summary.changedWorkspaces += result.report.changed ? 1 : 0;
      summary.migratedNotes += result.report.migratedCount;
      summary.emptyMarkdownNotes += result.report.emptyMarkdownCount;
      summary.droppedSourcesCount += result.report.droppedSourcesCount;
      summary.results.push(result);
    } catch (error) {
      const message = error instanceof DuplicateWorkspaceSlugError
        ? `${error.message}: ${error.matches
            .map((match) => `${match.id} (${match.userId}) ${match.name}`)
            .join(", ")}`
        : error instanceof Error
          ? error.message
          : String(error);
      logger.error(`[notes-to-documents] Failed workspace ${workspace.id}: ${message}`);
      summary.failures.push({ workspace, error: message });
    }

    if (
      summary.processedWorkspaces === targets.length ||
      summary.processedWorkspaces % progressEvery === 0
    ) {
      logger.log(
        `[notes-to-documents] Progress ${summary.processedWorkspaces}/${targets.length} ` +
          `changed=${summary.changedWorkspaces} migratedNotes=${summary.migratedNotes} failures=${summary.failures.length}`,
      );
    }
  }

  return summary;
}
