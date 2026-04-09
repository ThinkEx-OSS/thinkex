export class WorkspaceProjectionNotReadyError extends Error {
  readonly workspaceId: string;
  readonly lastAppliedVersion: number | null;
  readonly latestEventVersion: number;

  constructor(params: {
    workspaceId: string;
    lastAppliedVersion: number | null;
    latestEventVersion: number;
  }) {
    const checkpointDescription =
      params.lastAppliedVersion == null
        ? "missing"
        : String(params.lastAppliedVersion);

    super(
      `Workspace projection not ready for ${params.workspaceId}: checkpoint=${checkpointDescription}, latestEventVersion=${params.latestEventVersion}. Run the workspace projection backfill before serving this workspace.`,
    );

    this.name = "WorkspaceProjectionNotReadyError";
    this.workspaceId = params.workspaceId;
    this.lastAppliedVersion = params.lastAppliedVersion;
    this.latestEventVersion = params.latestEventVersion;
  }
}
