import { logger } from "@/lib/utils/logger";

/**
 * Workspace operation queue to serialize concurrent operations
 * Maps workspaceId -> Promise representing the last operation
 */
export const workspaceOperationQueues = new Map<string, Promise<any>>();

/**
 * Execute workspace operation with serialization
 * Ensures operations on the same workspace are executed sequentially
 */
export async function executeWorkspaceOperation<T>(
    workspaceId: string,
    operation: () => Promise<T>
): Promise<T> {
    const queueSize = workspaceOperationQueues.size;
    const hasExistingQueue = workspaceOperationQueues.has(workspaceId);

    logger.debug("🔒 [QUEUE] Queuing operation for workspace:", {
        workspaceId: workspaceId.substring(0, 8),
        hasExistingQueue,
        totalQueues: queueSize,
    });

    // Get or create the queue for this workspace
    const currentQueue = workspaceOperationQueues.get(workspaceId) || Promise.resolve();

    // Chain the new operation after the current queue
    const newOperation = currentQueue
        .then(() => {
            logger.debug("🔓 [QUEUE] Executing queued operation for workspace:", workspaceId.substring(0, 8));
            return operation();
        })
        .catch((error) => {
            // Even if the previous operation failed, we still want to execute this one
            logger.debug("🔓 [QUEUE] Previous operation failed, executing anyway for workspace:", workspaceId.substring(0, 8));
            return operation();
        });

    // Update the queue
    workspaceOperationQueues.set(workspaceId, newOperation);

    // Clean up the queue after the operation completes
    newOperation.finally(() => {
        // Only delete if this is still the current operation
        if (workspaceOperationQueues.get(workspaceId) === newOperation) {
            workspaceOperationQueues.delete(workspaceId);
            logger.debug("✅ [QUEUE] Cleaned up queue for workspace:", workspaceId.substring(0, 8));
        }
    });

    return newOperation;
}

// loadCurrentState removed - use loadWorkspaceState from "@/lib/workspace/state-loader" instead
