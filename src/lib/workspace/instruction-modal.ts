export function getNewWorkspaceInstructionKeys(userId: string | null | undefined, workspaceId: string): string[] {
  const safeUserId = userId ?? "anonymous";
  return [
    `workspace-instruction-new-workspace:${safeUserId}:${workspaceId}`,
    `workspace-instruction-new-workspace:${workspaceId}`,
  ];
}

export function markNewWorkspaceInstruction(userId: string | null | undefined, workspaceId: string): void {
  if (!workspaceId) return;
  const keys = getNewWorkspaceInstructionKeys(userId, workspaceId);
  try {
    keys.forEach((key) => window.localStorage.setItem(key, "true"));
  } catch {
    // no-op: storage unavailable
  }
}
