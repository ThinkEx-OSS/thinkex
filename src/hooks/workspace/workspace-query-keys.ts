export function workspaceEventsQueryKey(workspaceId: string | null) {
  return ["workspace", workspaceId, "events"] as const;
}

export function workspaceStateQueryKey(workspaceId: string | null) {
  return ["workspace", workspaceId, "state"] as const;
}
