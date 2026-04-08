import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type { WorkspaceEvent } from "./events";
import { projectWorkspaceEvent } from "./workspace-items-projection";

export interface AppendWorkspaceEventResult {
  version: number;
  conflict: boolean;
}

export function parseAppendWorkspaceEventResult(
  rawResult: unknown,
): AppendWorkspaceEventResult {
  if (typeof rawResult === "object" && rawResult !== null) {
    const version = Number((rawResult as { version?: unknown }).version ?? 0);
    const conflictValue = (rawResult as { conflict?: unknown }).conflict;
    return {
      version: Number.isFinite(version) ? version : 0,
      conflict:
        conflictValue === true ||
        conflictValue === "t" ||
        conflictValue === "true",
    };
  }

  const resultString =
    typeof rawResult === "string" ? rawResult : String(rawResult);
  const match = resultString.match(/\(\s*(\d+)\s*,\s*(t|f|true|false)\s*\)/i);

  if (!match) {
    throw new Error(
      `append_workspace_event returned unexpected format: ${resultString}`,
    );
  }

  return {
    version: Number.parseInt(match[1], 10),
    conflict: ["t", "true"].includes(match[2].toLowerCase()),
  };
}

export async function appendWorkspaceEventWithProjection(params: {
  workspaceId: string;
  event: WorkspaceEvent;
  baseVersion: number;
}): Promise<AppendWorkspaceEventResult> {
  const { workspaceId, event, baseVersion } = params;

  const appendOnce = async (executor: { execute: typeof db.execute }) => {
    const result = await executor.execute(sql`
      SELECT append_workspace_event(
        ${workspaceId}::uuid,
        ${event.id}::text,
        ${event.type}::text,
        ${JSON.stringify(event.payload)}::jsonb,
        ${event.timestamp}::bigint,
        ${event.userId}::text,
        ${baseVersion}::integer,
        ${event.userName || null}::text
      ) as result
    `);

    if (!result || result.length === 0 || !result[0]) {
      throw new Error("append_workspace_event returned no result");
    }

    return parseAppendWorkspaceEventResult(result[0].result);
  };

  const supportsTransaction = typeof (db as { transaction?: unknown }).transaction === "function";

  const appendResult = supportsTransaction
    ? await db.transaction(async (tx) => {
        const parsed = await appendOnce(tx);
        if (!parsed.conflict) {
          await projectWorkspaceEvent(
            workspaceId,
            { ...event, version: parsed.version },
            tx,
          );
        }

        return parsed;
      })
    : await appendOnce(db);

  return appendResult;
}

export async function appendWorkspaceEventAtCurrentVersionWithProjection(params: {
  workspaceId: string;
  event: WorkspaceEvent;
}): Promise<AppendWorkspaceEventResult> {
  const { workspaceId, event } = params;
  const result = await db.execute(sql`
    SELECT get_workspace_version(${workspaceId}::uuid) as version
  `);
  const baseVersion = Number(result[0]?.version ?? 0);

  return appendWorkspaceEventWithProjection({
    workspaceId,
    event,
    baseVersion: Number.isFinite(baseVersion) ? baseVersion : 0,
  });
}
