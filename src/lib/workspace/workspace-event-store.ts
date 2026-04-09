import { db } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { broadcastWorkspaceEventFromServer } from "@/lib/realtime/server-broadcast";
import { logger } from "@/lib/utils/logger";
import type { WorkspaceEvent } from "./events";
import { projectWorkspaceEvent } from "./workspace-items-projector";

const APPEND_RESULT_REGEX = /\(\s*(\d+)\s*,\s*(t|f|true|false)\s*\)/i;

export interface WorkspaceEventAppendSuccess {
  conflict: false;
  persistedEvent: WorkspaceEvent & { version: number };
  version: number;
}

export interface WorkspaceEventAppendConflict {
  conflict: true;
  version: number;
}

export type WorkspaceEventAppendResult =
  | WorkspaceEventAppendSuccess
  | WorkspaceEventAppendConflict;

export function parseWorkspaceAppendResult(rawResult: unknown): {
  version: number;
  conflict: boolean;
} {
  if (typeof rawResult === "object" && rawResult !== null) {
    const version = Number((rawResult as { version?: unknown }).version ?? 0);
    const rawConflict = (rawResult as { conflict?: unknown }).conflict;
    const conflict =
      rawConflict === true ||
      (typeof rawConflict === "string" &&
        ["t", "true"].includes(rawConflict.toLowerCase().trim()));

    return {
      version: Number.isFinite(version) ? version : 0,
      conflict,
    };
  }

  const resultString =
    typeof rawResult === "string" ? rawResult : String(rawResult);
  const match = resultString.match(APPEND_RESULT_REGEX);

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

export async function getWorkspaceVersion(
  workspaceId: string,
): Promise<number> {
  const result = await db.execute(sql`
    SELECT get_workspace_version(${workspaceId}::uuid) as version
  `);

  return Number(result[0]?.version ?? 0);
}

async function appendWorkspaceEventInTransaction(
  workspaceId: string,
  event: WorkspaceEvent,
  baseVersion: number,
): Promise<WorkspaceEventAppendResult> {
  const result = await db.transaction(async (tx: any) => {
    const appendResultRows = await tx.execute(sql`
      SELECT append_workspace_event(
        ${workspaceId}::uuid,
        ${event.id}::text,
        ${event.type}::text,
        ${JSON.stringify(event.payload)}::jsonb,
        ${event.timestamp}::bigint,
        ${event.userId}::text,
        ${baseVersion}::integer,
        ${event.userName ?? null}::text
      ) as result
    `);

    if (!appendResultRows?.length || !appendResultRows[0]) {
      throw new Error("append_workspace_event returned no result");
    }

    const parsed = parseWorkspaceAppendResult(appendResultRows[0].result);

    if (parsed.conflict) {
      return {
        conflict: true,
        version: parsed.version,
      } satisfies WorkspaceEventAppendConflict;
    }

    await projectWorkspaceEvent(tx, {
      workspaceId,
      event,
      version: parsed.version,
    });

    return {
      conflict: false,
      version: parsed.version,
      persistedEvent: {
        ...event,
        version: parsed.version,
      },
    } satisfies WorkspaceEventAppendSuccess;
  });

  if (!result.conflict) {
    void broadcastWorkspaceEventFromServer(
      workspaceId,
      result.persistedEvent,
    ).catch((error) => {
      logger.error("Failed to broadcast persisted workspace event", {
        workspaceId,
        eventId: result.persistedEvent.id,
        version: result.persistedEvent.version,
        error,
      });
    });
  }

  return result;
}

export async function appendWorkspaceEventWithBaseVersion(params: {
  workspaceId: string;
  event: WorkspaceEvent;
  baseVersion: number;
}): Promise<WorkspaceEventAppendResult> {
  return appendWorkspaceEventInTransaction(
    params.workspaceId,
    params.event,
    params.baseVersion,
  );
}

export async function appendWorkspaceEventUsingCurrentVersion(params: {
  workspaceId: string;
  event: WorkspaceEvent;
}): Promise<WorkspaceEventAppendResult> {
  const baseVersion = await getWorkspaceVersion(params.workspaceId);
  return appendWorkspaceEventWithBaseVersion({
    workspaceId: params.workspaceId,
    event: params.event,
    baseVersion,
  });
}

export async function appendWorkspaceEventUsingCurrentVersionWithRetry(params: {
  workspaceId: string;
  event: WorkspaceEvent;
  maxRetries?: number;
  conflictMessage?: string;
}): Promise<WorkspaceEventAppendSuccess> {
  let baseVersion = await getWorkspaceVersion(params.workspaceId);
  const maxRetries = params.maxRetries ?? 0;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const result = await appendWorkspaceEventWithBaseVersion({
      workspaceId: params.workspaceId,
      event: params.event,
      baseVersion,
    });

    if (!result.conflict) {
      return result;
    }

    baseVersion = result.version;
    attempt += 1;
  }

  throw new Error(
    params.conflictMessage ??
      `Version conflict appending event ${params.event.id} to workspace ${params.workspaceId}`,
  );
}

export async function appendWorkspaceEventOrThrow(params: {
  workspaceId: string;
  event: WorkspaceEvent;
  baseVersion?: number;
  conflictMessage?: string;
}): Promise<WorkspaceEventAppendSuccess> {
  const result =
    typeof params.baseVersion === "number"
      ? await appendWorkspaceEventWithBaseVersion({
          workspaceId: params.workspaceId,
          event: params.event,
          baseVersion: params.baseVersion,
        })
      : await appendWorkspaceEventUsingCurrentVersion({
          workspaceId: params.workspaceId,
          event: params.event,
        });

  if (result.conflict) {
    throw new Error(
      params.conflictMessage ??
        `Version conflict appending event ${params.event.id} to workspace ${params.workspaceId}`,
    );
  }

  return result;
}
