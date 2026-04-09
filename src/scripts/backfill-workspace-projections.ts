import {
  backfillAllWorkspaceProjections,
  listWorkspaceIdsForProjectionBackfill,
} from "../lib/workspace/workspace-projection-backfill";

export function parseWorkspaceIds(argv: string[]): string[] {
  return argv
    .filter((arg) => arg.startsWith("--workspace-id="))
    .map((arg) => arg.slice("--workspace-id=".length))
    .filter(Boolean);
}

export async function main() {
  const workspaceIds = parseWorkspaceIds(process.argv.slice(2));
  const targetWorkspaceIds =
    workspaceIds.length > 0
      ? workspaceIds
      : await listWorkspaceIdsForProjectionBackfill();

  console.log(
    `[workspace-projection-backfill] Rebuilding projections for ${targetWorkspaceIds.length} workspace(s)`,
  );

  const results = await backfillAllWorkspaceProjections({
    workspaceIds: targetWorkspaceIds,
  });

  for (const result of results) {
    console.log(
      `[workspace-projection-backfill] ${result.workspaceId} -> version ${result.lastAppliedVersion}`,
    );
  }

  console.log("[workspace-projection-backfill] Done");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("[workspace-projection-backfill] Failed", error);
    process.exitCode = 1;
  });
}
