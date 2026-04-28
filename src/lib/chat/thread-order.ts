import type { ThreadListItem } from "@/lib/chat/queries";
import {
  isRunningThreadStatus,
  type ThreadStatus,
} from "@/lib/chat/thread-runtime-state";

interface ThreadOrderingInput {
  getThreadStatus: (threadId: string) => ThreadStatus;
  getThreadLastStartedAt: (threadId: string) => number;
}

/**
 * Preserve the server's recency ordering for non-running threads, while
 * bubbling currently-running threads to the top. Among running threads, the
 * most recently started one wins.
 */
export function orderThreadsByRuntimeActivity(
  threads: ThreadListItem[],
  input: ThreadOrderingInput,
): ThreadListItem[] {
  return [...threads].sort((a, b) => {
    const aRunning = isRunningThreadStatus(input.getThreadStatus(a.id));
    const bRunning = isRunningThreadStatus(input.getThreadStatus(b.id));

    if (aRunning !== bRunning) {
      return aRunning ? -1 : 1;
    }

    if (!aRunning && !bRunning) {
      return 0;
    }

    return input.getThreadLastStartedAt(b.id) - input.getThreadLastStartedAt(a.id);
  });
}
