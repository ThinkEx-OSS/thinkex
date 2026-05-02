export type ActiveChatStatus = "submitted" | "streaming" | "ready" | "error";

export type ThreadStatus = ActiveChatStatus | "idle";

export function isRunningThreadStatus(status: ThreadStatus): boolean {
  return status === "submitted" || status === "streaming";
}
