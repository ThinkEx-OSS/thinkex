import type { AssistantClient, ThreadListItemRuntime } from "@assistant-ui/react";

/**
 * `useAui().threadListItem()` methods are typed as returning `void`, but they are
 * bound to `ThreadListItemRuntime` methods that return `Promise<void>`.
 * Use the runtime for correct `await` / error handling.
 */
function getThreadListItemRuntime(aui: AssistantClient): ThreadListItemRuntime {
  const runtime = aui.threadListItem().__internal_getRuntime?.();
  if (!runtime) {
    throw new Error("Thread list item runtime is not available");
  }
  return runtime;
}

export async function deleteThreadListItem(
  aui: AssistantClient,
): Promise<void> {
  await getThreadListItemRuntime(aui).delete();
}

export async function renameThreadListItem(
  aui: AssistantClient,
  newTitle: string,
): Promise<void> {
  await getThreadListItemRuntime(aui).rename(newTitle);
}
